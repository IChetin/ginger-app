import { HAND_INPUT_MODES, resolveHandInputMode } from "@/config/features";
import { useHandInputMode } from "@/features/hands/lib/useHandInputMode";
import { useHandInputRoute } from "@/features/hands/lib/useHandInputRoute";
import { HandTablePage } from "@/features/hands/pages/HandTablePage";
import { HandWizardPage } from "@/features/hands/pages/HandWizardPage";

export function HandInputPage() {
  const { draftId } = useHandInputRoute();
  const { mode } = useHandInputMode();
  const resolved = resolveHandInputMode(
    HAND_INPUT_MODES.includes(mode) ? mode : HAND_INPUT_MODES[0],
  );
  const page = resolved === "table" ? <HandTablePage /> : <HandWizardPage />;
  return (
    <div key={draftId ?? "new"} className="contents">
      {page}
    </div>
  );
}
