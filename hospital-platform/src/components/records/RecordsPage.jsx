import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { supabase } from "../../supabase";
import { MAX_FILE_BYTES, MEDICAL_FILE_TYPES } from "../../constants";
import { errorMessage, formatDate, formatFileSize, sameId, todayLocal } from "../../utils/helpers";
import { EmptyState, Notice, PageHeader, RefreshButton } from "../common";

export function RecordsPage({ userId, isPatient, isDoctor, myDoctor, myDoctorLoaded }) {
  const canUpload = !isPatient;
  const [records, setRecords] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState({ tone: "", text: "" });
  const [form, setForm] = useState({ patient_id: "", title: "", file: null });
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [patientFilter, setPatientFilter] = useState("all");
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (canUpload) {
        const { data: patientData, error: patientError } = await supabase.rpc("get_medical_record_patients");
        if (patientError) throw patientError;
        setPatients(patientData || []);
      }
      let query = supabase
        .from("medical_records")
        .select(
          "id, patient_id, record_date, title, diagnosis, notes, file_path, file_name, mime_type, file_size_bytes, uploaded_by, created_at, doctor:doctors(full_name)"
        )
        .order("record_date", { ascending: false })
        .order("id", { ascending: false });

      // The database already limits rows to what this account may see.
      // Patients also filter explicitly, so a policy mistake can't widen the list.
      if (isPatient) query = query.eq("patient_id", userId);
      const { data, error } = await query;
      if (error) throw error;
      setRecords(data || []);
    } catch (error) {
      console.error("Medical records error:", error);
      setNotice({ tone: "error", text: errorMessage(error, "Medical records couldn't be loaded.") });
    } finally {
      setLoading(false);
    }
  }, [canUpload, isPatient, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const patientName = (id) => patients.find((p) => sameId(p.id, id))?.full_name || "Patient";
  const shown = patientFilter === "all" ? records : records.filter((r) => sameId(r.patient_id, patientFilter));

  async function upload(event) {
    event.preventDefault();
    setNotice({ tone: "", text: "" });
    const file = form.file;

    if (!form.patient_id || !form.title.trim() || !file) {
      return setNotice({ tone: "error", text: "Choose a patient, add a title and select a file." });
    }
    if (!MEDICAL_FILE_TYPES.includes(file.type) || !/\.(pdf|jpe?g|png|webp)$/i.test(file.name)) {
      return setNotice({ tone: "error", text: "Upload a PDF, JPG, PNG or WEBP file." });
    }
    if (file.size > MAX_FILE_BYTES) {
      return setNotice({ tone: "error", text: "Files can be up to 10 MB." });
    }

    setUploading(true);
    // The first folder is the patient's id; Storage policies use it to decide who can read the file.
    const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-100);
    const objectPath = `${form.patient_id}/${crypto.randomUUID()}-${safeName}`;

    try {
      const { error: storageError } = await supabase.storage
        .from("medical-documents")
        .upload(objectPath, file, { contentType: file.type, cacheControl: "3600", upsert: false });
      if (storageError) throw storageError;

      const { error: recordError } = await supabase.from("medical_records").insert({
        patient_id: form.patient_id,
        title: form.title.trim(),
        record_date: todayLocal(),
        file_path: objectPath,
        file_name: file.name,
        mime_type: file.type,
        file_size_bytes: file.size,
      });

      if (recordError) {
        await supabase.storage.from("medical-documents").remove([objectPath]);
        throw recordError;
      }

      setNotice({ tone: "success", text: `"${form.title.trim()}" was shared with ${patientName(form.patient_id)}.` });
      setForm({ patient_id: "", title: "", file: null });
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (error) {
      console.error("Upload error:", error);
      const message = String(error?.message || "");
      setNotice({
        tone: "error",
        text: /bucket not found/i.test(message)
          ? 'The "medical-documents" bucket is missing. Run the CarePoint SQL setup.'
          : /row-level security|permission|unauthorized|403/i.test(message)
            ? "You can only upload for patients who have booked with you."
            : /payload too large|maximum.*size/i.test(message)
              ? "That file is larger than the 10 MB limit."
              : `Upload failed: ${message || "unknown error"}`,
      });
    } finally {
      setUploading(false);
    }
  }

  async function openDocument(record) {
    // Open the tab during the click so pop-up blockers allow it, then point it at the signed URL.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    const { data, error } = await supabase.storage.from("medical-documents").createSignedUrl(record.file_path, 60);
    if (error || !data?.signedUrl) {
      tab?.close();
      return setNotice({ tone: "error", text: "This document couldn't be opened. You may not have access to it." });
    }
    if (tab) tab.location.href = data.signedUrl;
    else window.location.assign(data.signedUrl);
  }

  async function remove(record) {
    if (!window.confirm(`Delete "${record.title || record.file_name}" permanently?`)) return;

    const prevRecords = records;
    // Optimistic UI removal
    setRecords((current) => current.filter((r) => r.id !== record.id));
    setDeletingId(record.id);
    setNotice({ tone: "", text: "" });

    // Delete the database row first: if that's not allowed, the file stays untouched.
    const { data: deleted, error: rowError } = await supabase
      .from("medical_records")
      .delete()
      .eq("id", record.id)
      .select("id");

    if (rowError || !deleted?.length) {
      // Revert on error
      setRecords(prevRecords);
      setDeletingId(null);
      return setNotice({
        tone: "error",
        text: rowError
          ? errorMessage(rowError, "The record couldn't be deleted.")
          : "Only an administrator or the doctor who uploaded this document can delete it.",
      });
    }

    if (record.file_path) {
      const { error: fileError } = await supabase.storage.from("medical-documents").remove([record.file_path]);
      if (fileError) console.warn("Record deleted but file remained in Storage:", fileError.message);
    }

    setDeletingId(null);
    setNotice({ tone: "success", text: "Document deleted." });
  }

  const waitingForLink = isDoctor && myDoctorLoaded && !myDoctor;

  return (
    <>
      <PageHeader
        title={isPatient ? "My medical records" : "Medical records"}
        description={
          isPatient
            ? "Reports and documents your care team has shared with you. Only you and your care team can see them."
            : isDoctor
              ? "Documents for patients who have booked with you."
              : "Upload and manage documents for any patient."
        }
      >
        <RefreshButton onClick={load} busy={loading} />
      </PageHeader>

      <Notice tone={notice.tone || "info"} onClose={() => setNotice({ tone: "", text: "" })}>
        {notice.text}
      </Notice>

      {waitingForLink && (
        <Notice tone="info">
          You can upload documents once an administrator has verified your doctor account.
        </Notice>
      )}

      {canUpload && !waitingForLink && (
        <form className="panel form-panel" onSubmit={upload}>
          <h2>Upload a document</h2>
          <div className="form-grid form-grid-3">
            <label className="field">
              <span>Patient</span>
              <select
                required
                value={form.patient_id}
                onChange={(e) => setForm((f) => ({ ...f, patient_id: e.target.value }))}
              >
                <option value="">{patients.length ? "Choose a patient" : "No patients available"}</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.full_name || "Unnamed patient"} ({patient.id.slice(0, 6)})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Title</span>
              <input
                required
                maxLength="160"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Blood test results"
              />
            </label>
            <label className="field">
              <span>File (PDF or image, up to 10 MB)</span>
              <input
                ref={fileInputRef}
                required
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
              />
            </label>
          </div>
          <div className="button-row">
            <button className="btn btn-primary" type="submit" disabled={uploading || patients.length === 0}>
              <Upload size={18} aria-hidden="true" /> {uploading ? "Uploading…" : "Upload"}
            </button>
            {patients.length === 0 && !loading && (
              <span className="muted small">
                {isDoctor ? "Patients appear here after they book with you." : "No patient accounts exist yet."}
              </span>
            )}
          </div>
        </form>
      )}

      {canUpload && records.length > 0 && (
        <div className="list-toolbar">
          <label className="field field-inline">
            <span>Show</span>
            <select value={patientFilter} onChange={(e) => setPatientFilter(e.target.value)}>
              <option value="all">All patients</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || "Unnamed patient"}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {loading && records.length === 0 ? (
        <p className="muted loading-line">Loading records…</p>
      ) : shown.length === 0 ? (
        <EmptyState title="No documents yet">
          {isPatient
            ? "When your doctor or the hospital shares a report with you, it will appear here."
            : "Uploaded documents will appear here."}
        </EmptyState>
      ) : (
        <ul className="panel row-list">
          {shown.map((record) => (
            <li className="row record-row" key={record.id}>
              <span className="file-icon" aria-hidden="true">
                <FileText size={20} />
              </span>
              <div className="row-main">
                <strong>{record.title || record.file_name || "Document"}</strong>
                <span className="muted">
                  {[
                    canUpload && patientName(record.patient_id),
                    formatDate(record.record_date, { day: "numeric", month: "short", year: "numeric" }),
                    record.doctor?.full_name && `from ${record.doctor.full_name}`,
                    formatFileSize(record.file_size_bytes),
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </span>
                {record.diagnosis && <span className="row-note">Assessment: {record.diagnosis}</span>}
                {record.notes && <span className="row-note">{record.notes}</span>}
              </div>
              <div className="row-actions">
                {record.file_path && (
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => openDocument(record)}>
                    Open
                  </button>
                )}
                {canUpload && (
                  <button
                    type="button"
                    className="btn btn-quiet btn-small"
                    disabled={deletingId === record.id}
                    onClick={() => remove(record)}
                  >
                    {deletingId === record.id ? "Deleting…" : "Delete"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

