/**
 * How long the bounce animation runs, in ms.
 *
 * It has to match `debu-shake` in app.css — the timer that ends the state is
 * what stops the class from being reapplied mid-animation — and two components
 * now start that animation: `WordEntry` for the typist, whose own bounce is
 * local and instant, and the room page for everyone watching, driven by
 * `typing.rejectSeq`. One number, so the table never shakes out of step.
 */
export const SHAKE_MS = 560;
