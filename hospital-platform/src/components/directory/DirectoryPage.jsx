import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { supabase } from "../../supabase";
import { WEEKDAYS } from "../../constants";
import { errorMessage, initialOf, sameId, workingDays } from "../../utils/helpers";
import { EmptyState, Notice, PageHeader, RefreshButton } from "../common";
import { ScheduleEditor } from "./ScheduleEditor";

const EMPTY_DOCTOR_FORM = {
  full_name: "",
  specialty_id: "",
  qualifications: "",
  experience_years: "0",
  bio: "",
};

export function DirectoryPage({
  isAdmin,
  isPatient,
  directory,
  loading,
  error,
  reload,
  specialtyFilter,
  setSpecialtyFilter,
  onBook,
}) {
  const { specialties, doctors, hours } = directory;
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState({ tone: "", text: "" });
  const [panel, setPanel] = useState(null); // "doctor" | "specialty" | null
  const [doctorForm, setDoctorForm] = useState(EMPTY_DOCTOR_FORM);
  const [specialtyForm, setSpecialtyForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [scheduleDoctor, setScheduleDoctor] = useState(null);

  const listedDoctors = isAdmin ? doctors : doctors.filter((d) => d.is_active);
  const listedSpecialties = isAdmin ? specialties : specialties.filter((s) => s.is_active);

  // If the selected specialty disappears (deactivated), fall back to all.
  useEffect(() => {
    if (specialtyFilter !== "all" && !loading && !listedSpecialties.some((s) => sameId(s.id, specialtyFilter))) {
      setSpecialtyFilter("all");
    }
  }, [listedSpecialties, specialtyFilter, setSpecialtyFilter, loading]);

  const countBySpecialty = useMemo(() => {
    const counts = {};
    listedDoctors.forEach((d) => {
      counts[d.specialty_id] = (counts[d.specialty_id] || 0) + 1;
    });
    return counts;
  }, [listedDoctors]);

  const selectedSpecialty = listedSpecialties.find((s) => sameId(s.id, specialtyFilter));
  const query = search.trim().toLowerCase();
  const visibleDoctors = listedDoctors.filter((doctor) => {
    if (specialtyFilter !== "all" && !sameId(doctor.specialty_id, specialtyFilter)) return false;
    if (!query) return true;
    return [doctor.full_name, doctor.qualifications, doctor.bio, doctor.specialties?.name].some((value) =>
      String(value || "").toLowerCase().includes(query)
    );
  });

  const say = (tone, text) => setNotice({ tone, text });

  async function addDoctor(event) {
    event.preventDefault();
    setSaving(true);
    say("", "");
    const { error: saveError } = await supabase.from("doctors").insert({
      full_name: doctorForm.full_name.trim(),
      specialty_id: doctorForm.specialty_id || null,
      qualifications: doctorForm.qualifications.trim() || null,
      experience_years: Math.max(0, Number(doctorForm.experience_years) || 0),
      bio: doctorForm.bio.trim() || null,
      is_active: true,
    });
    setSaving(false);
    if (saveError) return say("error", errorMessage(saveError, "The doctor couldn't be saved."));
    say("success", `${doctorForm.full_name.trim()} was added. Set their working hours so patients can book.`);
    setDoctorForm(EMPTY_DOCTOR_FORM);
    setPanel(null);
    reload();
  }

  async function addSpecialty(event) {
    event.preventDefault();
    setSaving(true);
    say("", "");
    const { error: saveError } = await supabase.from("specialties").insert({
      name: specialtyForm.name.trim(),
      description: specialtyForm.description.trim() || null,
      is_active: true,
    });
    setSaving(false);
    if (saveError) return say("error", errorMessage(saveError, "The specialty couldn't be saved."));
    say("success", `${specialtyForm.name.trim()} was added.`);
    setSpecialtyForm({ name: "", description: "" });
    setPanel(null);
    reload();
  }

  async function toggleActive(table, row, label) {
    say("", "");
    const { error: saveError } = await supabase.from(table).update({ is_active: !row.is_active }).eq("id", row.id);
    if (saveError) return say("error", errorMessage(saveError, "The change couldn't be saved."));
    say("success", `${label} is now ${row.is_active ? "hidden from patients" : "visible to patients"}.`);
    reload();
  }

  return (
    <>
      <PageHeader
        title={isAdmin ? "Doctors & specialties" : "Find a doctor"}
        description={
          isAdmin
            ? "Manage the directory patients book from."
            : "Choose a specialty to narrow the list, then book a time that suits you."
        }
      >
        <RefreshButton onClick={reload} busy={loading} />
        {isPatient && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onBook({ specialtyId: specialtyFilter === "all" ? null : specialtyFilter })}
          >
            <Plus size={18} aria-hidden="true" />
            {selectedSpecialty ? `Book ${selectedSpecialty.name}` : "Book appointment"}
          </button>
        )}
        {isAdmin && (
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPanel(panel === "specialty" ? null : "specialty")}
            >
              Add specialty
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setPanel(panel === "doctor" ? null : "doctor")}
            >
              <Plus size={18} aria-hidden="true" /> Add doctor
            </button>
          </>
        )}
      </PageHeader>

      <Notice tone="error">{error}</Notice>
      <Notice tone={notice.tone || "info"} onClose={() => say("", "")}>
        {notice.text}
      </Notice>

      {isAdmin && panel === "doctor" && (
        <form className="panel form-panel" onSubmit={addDoctor}>
          <h2>Add a doctor</h2>
          <div className="form-grid">
            <label className="field">
              <span>Full name</span>
              <input
                required
                value={doctorForm.full_name}
                onChange={(e) => setDoctorForm({ ...doctorForm, full_name: e.target.value })}
                placeholder="Dr. Aanya Sharma"
              />
            </label>
            <label className="field">
              <span>Specialty</span>
              <select
                value={doctorForm.specialty_id}
                onChange={(e) => setDoctorForm({ ...doctorForm, specialty_id: e.target.value })}
              >
                <option value="">Not assigned</option>
                {specialties
                  .filter((s) => s.is_active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>Qualifications</span>
              <input
                value={doctorForm.qualifications}
                onChange={(e) => setDoctorForm({ ...doctorForm, qualifications: e.target.value })}
                placeholder="MBBS, MD"
              />
            </label>
            <label className="field">
              <span>Years of experience</span>
              <input
                type="number"
                min="0"
                max="70"
                value={doctorForm.experience_years}
                onChange={(e) => setDoctorForm({ ...doctorForm, experience_years: e.target.value })}
              />
            </label>
            <label className="field field-wide">
              <span>Short introduction</span>
              <textarea
                rows="3"
                value={doctorForm.bio}
                onChange={(e) => setDoctorForm({ ...doctorForm, bio: e.target.value })}
                placeholder="Areas of clinical interest"
              />
            </label>
          </div>
          <div className="button-row">
            <button className="btn btn-primary" type="submit" disabled={saving || !doctorForm.full_name.trim()}>
              {saving ? "Saving…" : "Save doctor"}
            </button>
            <button className="btn btn-quiet" type="button" onClick={() => setPanel(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {isAdmin && panel === "specialty" && (
        <form className="panel form-panel" onSubmit={addSpecialty}>
          <h2>Add a specialty</h2>
          <div className="form-grid">
            <label className="field">
              <span>Name</span>
              <input
                required
                value={specialtyForm.name}
                onChange={(e) => setSpecialtyForm({ ...specialtyForm, name: e.target.value })}
                placeholder="Dermatology"
              />
            </label>
            <label className="field">
              <span>What it treats</span>
              <input
                value={specialtyForm.description}
                onChange={(e) => setSpecialtyForm({ ...specialtyForm, description: e.target.value })}
                placeholder="Skin, hair and nail conditions"
              />
            </label>
          </div>
          <div className="button-row">
            <button className="btn btn-primary" type="submit" disabled={saving || !specialtyForm.name.trim()}>
              {saving ? "Saving…" : "Save specialty"}
            </button>
            <button className="btn btn-quiet" type="button" onClick={() => setPanel(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {isAdmin && scheduleDoctor && (
        <ScheduleEditor
          key={scheduleDoctor.id}
          doctor={scheduleDoctor}
          hours={hours}
          onClose={() => setScheduleDoctor(null)}
          onSaved={(name) => {
            setScheduleDoctor(null);
            say("success", `Working hours saved for ${name}.`);
            reload();
          }}
        />
      )}

      <section className="filter-bar" aria-label="Filter doctors">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or qualification"
            aria-label="Search doctors"
          />
        </label>
        <div className="chip-row" role="group" aria-label="Specialty">
          <button
            type="button"
            className="chip"
            aria-pressed={specialtyFilter === "all"}
            onClick={() => setSpecialtyFilter("all")}
          >
            All <span className="chip-count">{listedDoctors.length}</span>
          </button>
          {listedSpecialties.map((specialty) => (
            <button
              key={specialty.id}
              type="button"
              className={`chip${specialty.is_active ? "" : " chip-inactive"}`}
              aria-pressed={sameId(specialtyFilter, specialty.id)}
              onClick={() => setSpecialtyFilter(String(specialty.id))}
            >
              {specialty.name} <span className="chip-count">{countBySpecialty[specialty.id] || 0}</span>
            </button>
          ))}
        </div>
        {selectedSpecialty?.description && <p className="filter-note">{selectedSpecialty.description}</p>}
      </section>

      {loading && doctors.length === 0 ? (
        <p className="muted loading-line">Loading doctors…</p>
      ) : visibleDoctors.length === 0 ? (
        <EmptyState
          title={listedDoctors.length === 0 ? "No doctors listed yet" : "No doctors match"}
          action={
            listedDoctors.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSearch("");
                  setSpecialtyFilter("all");
                }}
              >
                Show all doctors
              </button>
            )
          }
        >
          {listedDoctors.length === 0
            ? isAdmin
              ? "Use Add doctor to create the first listing."
              : "Doctors will appear here once the hospital adds them."
            : "Try another specialty or clear the search."}
        </EmptyState>
      ) : (
        <>
          <p className="result-count">
            {visibleDoctors.length} {visibleDoctors.length === 1 ? "doctor" : "doctors"}
            {selectedSpecialty ? ` in ${selectedSpecialty.name}` : ""}
          </p>
          <div className="doctor-grid">
            {visibleDoctors.map((doctor) => {
              const days = workingDays(hours, doctor.id);
              return (
                <article className={`doctor-card${doctor.is_active ? "" : " is-inactive"}`} key={doctor.id}>
                  <div className="doctor-card-head">
                    {doctor.image_url ? (
                      <img
                        className="doctor-photo"
                        src={doctor.image_url}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <span className="doctor-initial" aria-hidden="true">
                        {initialOf(doctor.full_name)}
                      </span>
                    )}
                    <div>
                      <h3>{doctor.full_name}</h3>
                      <p className="doctor-specialty">{doctor.specialties?.name || "General"}</p>
                    </div>
                    {isAdmin && !doctor.is_active && <span className="badge badge-cancelled">Hidden</span>}
                  </div>
                  {(doctor.qualifications || doctor.experience_years > 0) && (
                    <p className="doctor-meta">
                      {[
                        doctor.qualifications,
                        doctor.experience_years > 0 &&
                          `${doctor.experience_years} ${doctor.experience_years === 1 ? "year" : "years"} experience`,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                  {doctor.bio && <p className="doctor-bio">{doctor.bio}</p>}
                  <div className="day-row" aria-label="Days available">
                    {days.length ? (
                      WEEKDAYS.map((day) => (
                        <span
                          key={day.value}
                          className={`day-dot${days.includes(day) ? " on" : ""}`}
                          title={day.label}
                        >
                          {day.short.charAt(0)}
                          <span className="visually-hidden">
                            {day.label} {days.includes(day) ? "available" : "unavailable"}
                          </span>
                        </span>
                      ))
                    ) : (
                      <span className="muted small">Hours not published yet</span>
                    )}
                  </div>
                  <div className="doctor-card-actions">
                    {isPatient && doctor.is_active && (
                      <button
                        type="button"
                        className="btn btn-primary btn-block"
                        disabled={!days.length}
                        onClick={() => onBook({ specialtyId: doctor.specialty_id, doctorId: doctor.id })}
                      >
                        Book appointment
                      </button>
                    )}
                    {isAdmin && (
                      <>
                        <button type="button" className="btn btn-secondary" onClick={() => setScheduleDoctor(doctor)}>
                          Working hours
                        </button>
                        <button
                          type="button"
                          className="btn btn-quiet"
                          onClick={() => toggleActive("doctors", doctor, doctor.full_name)}
                        >
                          {doctor.is_active ? "Hide" : "Show"}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {isAdmin && specialties.length > 0 && (
        <section className="panel list-panel">
          <h2>Specialties</h2>
          <ul className="row-list">
            {specialties.map((specialty) => (
              <li key={specialty.id} className="row">
                <div className="row-main">
                  <strong>{specialty.name}</strong>
                  <span className="muted">{specialty.description || "No description"}</span>
                </div>
                {!specialty.is_active && <span className="badge badge-cancelled">Hidden</span>}
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => toggleActive("specialties", specialty, specialty.name)}
                >
                  {specialty.is_active ? "Hide" : "Show"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

