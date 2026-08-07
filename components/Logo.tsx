import styles from "./Logo.module.css";

interface LogoProps {
  /** dark = ink on light bg · light = subtle on dark bg (footer) · bright = legible on dark bg (sidebars) */
  variant?: "dark" | "light" | "bright";
  tagline?: string;
  small?: boolean;
}

export default function Logo({ variant = "dark", tagline, small }: LogoProps) {
  const classes = [
    styles.logo,
    variant === "light" ? styles.light : "",
    variant === "bright" ? styles.bright : "",
    small ? styles.small : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      Vita<span className={styles.accent}>Re</span>Ba
      {tagline && <span> · {tagline}</span>}
    </div>
  );
}
