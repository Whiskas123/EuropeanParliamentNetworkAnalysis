"use client";

import { CountryFlag, getGroupAcronym } from "../lib/utils.js";
import RadialGauge from "./RadialGauge";
import "../styles/profile.scss";

/**
 * The two figures that place an MEP, beside the two facts that identify them.
 *
 * Group and country are the pair of memberships every MEP has, and how closely
 * someone votes with each is the first thing worth knowing about them - so the
 * figures belong on the identity block rather than four hundred pixels below
 * it, which is where they used to sit as two rows of a list.
 *
 * Both are normalised: the arc is where this MEP sits, the notch is where the
 * bloc itself sits, and the gap is how far they are from their own people. That
 * makes the two dials read the same way as every other dial in the sidebar and
 * as each other - which is the whole reason the national figure was moved onto
 * the same footing as the group one. See lib/normalisedAgreement.js.
 *
 * Where a figure is missing the cell is left out rather than drawn empty. An
 * MEP with nobody to be measured against is not an MEP who agrees with nobody.
 */
export default function MEPHeadlineDials({
  reading,
  mandate,
  node,
  groupColor,
  subject,
}) {
  const own = reading?.own;
  const national = reading?.national;
  const hasGroup = own && typeof own.value === "number";
  const hasNational = national && typeof national.value === "number";
  if (!hasGroup && !hasNational) return null;

  const name = node?.label ?? "This MEP";
  const where = subject ? ` on ${subject}` : "";

  return (
    <div className="mep-headline-dials">
      {hasGroup && (
        <RadialGauge
          value={own.value}
          baseline={own.level}
          color={groupColor || "#6B7C93"}
          label="Group"
          hover={[{ group: own.groupId }]}
          // The badge reads "N pp below <label>" beside the figure it belongs
          // to, so the label names only the other side of the comparison: what
          // a typical member of the same group manages.
          baselineLabel={`the average ${getGroupAcronym(
            own.groupId,
            mandate
          )} member's agreement with ${getGroupAcronym(own.groupId, mandate)}`}
          title={
            `${name} votes with ${getGroupAcronym(own.groupId, mandate)} ` +
            `${(own.value * 100).toFixed(1)}% of the time${where}` +
            (typeof own.level === "number"
              ? `; the group manages ${(own.level * 100).toFixed(
                  1
                )}% among itself over the same votes`
              : "")
          }
        />
      )}
      {hasNational && (
        <RadialGauge
          value={national.value}
          baseline={national.level}
          color="#6B7C93"
          // The country by name, with its flag before it. "National" named the
          // measure rather than the delegation, and the flag alone asked the
          // reader to know every one of twenty-seven — while the dial beside
          // it names its group outright.
          label={national.country}
          flag={<CountryFlag country={national.country} />}
          hover={[{ country: national.country }]}
          baselineLabel={`the average ${national.country} MEP's agreement with the delegation`}
          title={
            `${name} votes with the rest of the ${national.country} ` +
            `delegation ${(national.value * 100).toFixed(1)}% of the time` +
            `${where}` +
            (typeof national.level === "number"
              ? `; the delegation manages ${(national.level * 100).toFixed(
                  1
                )}% among itself over the same votes`
              : "")
          }
        />
      )}
    </div>
  );
}
