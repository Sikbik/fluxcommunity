/**
 * The builds section's overlays, mounted by the shell's OverlayHost: the detail drawer
 * (`#builds/<id>`) and the submit helper (the `submit` flag in the overlays store).
 */
import { DetailDrawer } from './DetailDrawer';
import { HealthBridge } from './HealthBridge';
import { SubmitDialog } from './SubmitDialog';

export default function BuildsOverlay() {
  return (
    <>
      <HealthBridge />
      <DetailDrawer />
      <SubmitDialog />
    </>
  );
}
