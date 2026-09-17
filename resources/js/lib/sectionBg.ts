import { SectionBackground } from "@/types/landing-page";

export function getSectionBgStyle(bg: SectionBackground): React.CSSProperties {
  const style: React.CSSProperties = {};

  switch (bg.background_type) {
    case "color":
      if (bg.background_color) style.backgroundColor = bg.background_color;
      break;
    case "gradient":
      if (bg.background_gradient) style.background = bg.background_gradient;
      break;
    case "image":
      if (bg.background_image_url) {
        style.backgroundImage = `url(${bg.background_image_url})`;
        style.backgroundSize = "cover";
        style.backgroundPosition = "center";
      }
      break;
  }

  if (bg.text_color) style.color = bg.text_color;

  return style;
}

export function hasCustomBg(bg: SectionBackground): boolean {
  return bg.background_type !== "default";
}

export function sectionTextColor(bg: SectionBackground): string | undefined {
  return bg.text_color || undefined;
}
