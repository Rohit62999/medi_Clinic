import { PatientQueue } from "./PatientQueue";
import { StaffQueue } from "./StaffQueue";

export function QueuePage(props) {
  return props.isPatient ? <PatientQueue /> : <StaffQueue {...props} />;
}

