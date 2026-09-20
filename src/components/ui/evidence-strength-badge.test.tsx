import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidenceStrengthBadge, EvidenceStrengthLevel } from "./evidence-strength-badge";

describe("EvidenceStrengthBadge Component", () => {
  const levels: EvidenceStrengthLevel[] = ["Strong", "Moderate", "Limited", "Insufficient"];

  it.each(levels)("renders badge correctly for %s level", (level) => {
    const html = renderToStaticMarkup(<EvidenceStrengthBadge level={level} />);
    expect(html).toContain(level);
    expect(html).toContain(`aria-label="Evidence strength: ${level}"`);
    expect(html).toContain("not a statistical confidence score");
  });

  it("omits tooltip when showTooltip is false", () => {
    const html = renderToStaticMarkup(<EvidenceStrengthBadge level="Strong" showTooltip={false} />);
    expect(html).not.toContain("title=");
  });

  it("applies distinct semantic styling classes per level", () => {
    const strongHtml = renderToStaticMarkup(<EvidenceStrengthBadge level="Strong" />);
    const modHtml = renderToStaticMarkup(<EvidenceStrengthBadge level="Moderate" />);
    const limHtml = renderToStaticMarkup(<EvidenceStrengthBadge level="Limited" />);
    const insHtml = renderToStaticMarkup(<EvidenceStrengthBadge level="Insufficient" />);

    expect(strongHtml).toContain("text-emerald-700");
    expect(modHtml).toContain("text-blue-700");
    expect(limHtml).toContain("text-amber-700");
    expect(insHtml).toContain("text-zinc-600");
  });
});
