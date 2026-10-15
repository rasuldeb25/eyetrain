/**
 * Pre-session check, shared by all games: which eye views this session (the clinical
 * metrics in slice 4 — interocular ratio, binocular summation — need OS/OU baselines
 * labeled correctly) and a one-click confirmation that the viewing distance still matches
 * the calibration (thresholds are meaningless at the wrong distance).
 */
import type { EyeCondition, ProfileRow } from "../data/db";

export const EYE_LABELS: Record<EyeCondition, string> = {
  OD: "OD — right eye (amblyopic, −15 D), LEFT eye patched — training",
  OS: "OS — left eye (fellow, −2.5 D), RIGHT eye patched — baseline",
  OU: "OU — both eyes open (binocular)",
};

export function Preflight(props: {
  profile: ProfileRow | undefined;
  eye: EyeCondition;
  onEye: (e: EyeCondition) => void;
  distanceOk: boolean;
  onDistanceOk: (ok: boolean) => void;
}) {
  return (
    <fieldset class="preflight">
      <legend>Pre-session check</legend>
      {(Object.keys(EYE_LABELS) as EyeCondition[]).map((e) => (
        <label key={e} class="block">
          <input type="radio" name="eye" checked={props.eye === e}
            onChange={() => props.onEye(e)} />{" "}
          {EYE_LABELS[e]}
        </label>
      ))}
      <label class="block">
        <input type="checkbox" checked={props.distanceOk}
          onChange={(ev) => props.onDistanceOk(ev.currentTarget.checked)} />{" "}
        Viewing distance verified:{" "}
        <strong>{props.profile ? `${props.profile.viewingDistanceCm} cm` : "—"}</strong>{" "}
        (arm's length / string check, same chair as calibration)
      </label>
    </fieldset>
  );
}
