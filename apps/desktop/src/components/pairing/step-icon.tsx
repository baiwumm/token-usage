import { Check } from "@gravity-ui/icons";
import { cn } from "@heroui/react";

export type StepState = "todo" | "active" | "done";

const STATE_LABEL: Record<StepState, string> = {
  todo: "未开始",
  active: "进行中",
  done: "已完成",
};

/** Numbered wizard step marker; turns into a check once the step is done. */
export function StepIcon({
  index,
  state,
}: {
  index: number;
  state: StepState;
}) {
  return (
    <span
      className={cn(
        "grid size-5.5 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
        state === "done" && "bg-success/15 text-success",
        state === "active" && "bg-accent text-accent-foreground",
        state === "todo" && "bg-default text-muted",
      )}
    >
      {state === "done" ? (
        <Check aria-hidden="true" className="size-3.5" />
      ) : (
        <span aria-hidden="true">{index}</span>
      )}
      <span className="sr-only">
        第 {index} 步，{STATE_LABEL[state]}
      </span>
    </span>
  );
}
