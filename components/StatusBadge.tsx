import { STATUS_LABEL } from "@/lib/labels";
import type { AppStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: AppStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}
