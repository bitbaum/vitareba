import styles from "../portal.module.css";
import profileStyles from "./profile.module.css";

type Props = {
  digestOptOut: boolean;
  onDigestOptOutChange: (checked: boolean) => void;
  reminderOptOut: boolean;
  onReminderOptOutChange: (checked: boolean) => void;
};

export function EmailPreferencesFields({
  digestOptOut, onDigestOptOutChange, reminderOptOut, onReminderOptOutChange,
}: Props) {
  return (
    <div className={styles.card} id="email-preferences">
      <p className={styles.cardTitle}>Email preferences</p>
      <label className={profileStyles.checkboxRow}>
        <input
          type="checkbox"
          className={profileStyles.checkboxInput}
          checked={digestOptOut}
          onChange={(e) => onDigestOptOutChange(e.target.checked)}
        />
        Opt out of weekly summary emails
      </label>
      <p className={profileStyles.checkboxHint}>
        Weekly summaries include your check-in averages, latest score, and booking status. Uncheck to receive them.
      </p>
      <label className={profileStyles.checkboxRow}>
        <input
          type="checkbox"
          className={profileStyles.checkboxInput}
          checked={reminderOptOut}
          onChange={(e) => onReminderOptOutChange(e.target.checked)}
        />
        Opt out of daily check-in reminder emails
      </label>
      <p className={profileStyles.checkboxHint}>
        Reminders are sent on days you haven&apos;t logged a check-in yet. Uncheck to receive them.
      </p>
    </div>
  );
}
