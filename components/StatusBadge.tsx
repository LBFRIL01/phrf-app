import { STATUS_LABEL } from "@/lib/labels";
import type { AppStatus } from "@/lib/types";

export function SailNumber({ value }: { value: string | null | undefined }) {
  return value ? <>{value}</> : <span className="badge badge-needs_info">Sail # needed</span>;
}

export function StatusBadge({ status }: { status: AppStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}
