// ============================================================================
// SEAM — NOT IMPLEMENTED IN THIS BUILD. Nothing calls this file.
// ============================================================================
//
// How dispensing actually works today:
//   The phone DISPLAYS a QR containing a one-time release token. The vending
//   machine's own scanner reads it and dispenses the kit. Our backend never
//   talks to the machine; its only jobs are to make the token single-use
//   (dispenser-release) and to keep an audit trail.
//
// There is NO vendor dispense API in this build, and none is faked. This
// interface exists so that IF a machine vendor later exposes a "dispense now"
// API, it can be added here — a new class implementing MachineDispenseProvider,
// selected by an env var — without touching claim logic, the QR payload, the
// one-kit-per-user rule, or dispenser-release.
//
// When wiring a real provider, decide deliberately where it is called from
// (most likely inside dispenser-release AFTER the atomic redeem succeeds, so a
// failed vendor call can be retried without ever releasing two kits).

export interface DispenseRequest {
  claimId: string;
  machineId: string;
  hospitalId: string | null;
}

export interface DispenseResult {
  ok: boolean;
  /** Vendor-side reference, for the audit trail. */
  vendorRef?: string;
}

export interface MachineDispenseProvider {
  readonly name: string;
  dispense(req: DispenseRequest): Promise<DispenseResult>;
}

/**
 * The provider in force today: the machine dispenses by SCANNING our QR, so
 * there is nothing for us to call. It is a deliberate no-op that records the
 * fact rather than pretending an API exists.
 */
export class ManualScanDispenseProvider implements MachineDispenseProvider {
  readonly name = 'manual-scan';
  dispense(req: DispenseRequest): Promise<DispenseResult> {
    console.log(
      `[dispense/manual-scan] no vendor call — machine ${req.machineId} dispenses by scanning the QR (claim ${req.claimId})`,
    );
    return Promise.resolve({ ok: true });
  }
}

/**
 * Use this while a vendor API is being written, so a half-wired integration
 * fails loudly instead of silently doing nothing.
 */
export class NotImplementedMachineDispenseProvider implements MachineDispenseProvider {
  readonly name = 'not-implemented';
  dispense(_req: DispenseRequest): Promise<DispenseResult> {
    throw new Error(
      'machine_dispense_not_implemented: no vendor API in this build.',
    );
  }
}

/**
 * MACHINE_DISPENSE_PROVIDER: "manual-scan" (default) today.
 * When the vendor supplies their spec, add a VendorApiDispenseProvider here and
 * call it from dispenser-release AFTER the atomic redeem succeeds, so a failed
 * vendor call can be retried without ever releasing two kits.
 */
export function getMachineDispenseProvider(): MachineDispenseProvider {
  return new ManualScanDispenseProvider();
}
