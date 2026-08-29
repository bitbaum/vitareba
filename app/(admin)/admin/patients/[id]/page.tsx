import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  users,
  assessmentResults,
  bookings,
  documents,
  threads,
  threadMessages,
  dailyCheckins,
  patientNotes,
  careTeam,
} from "@/lib/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import Link from "next/link";
import styles from "../../../admin.module.css";
import { DocumentAddForm } from "@/components/admin/DocumentAddForm";
import { AdminNotesForm } from "@/components/admin/AdminNotesForm";
import { ProgrammeAssignmentForm } from "@/components/admin/ProgrammeAssignmentForm";
import { clinicianLabelFor } from "@/lib/domain/clinician-label";
import { CheckinTrendChart } from "@/components/portal/CheckinTrendChart";
import { AssessmentTrendChart } from "@/components/portal/AssessmentTrendChart";
import { PatientProfileCard } from "@/components/admin/PatientProfileCard";
import { PatientAssessmentCard } from "@/components/admin/PatientAssessmentCard";
import { PatientBookingsCard } from "@/components/admin/PatientBookingsCard";
import { AdminBookingForm } from "@/components/admin/AdminBookingForm";
import { PatientMessagesCard } from "@/components/admin/PatientMessagesCard";
import { PatientGoalsCard } from "@/components/admin/PatientGoalsCard";
import { CareTeamCard } from "@/components/admin/CareTeamCard";
import { AiBriefCard } from "@/components/admin/AiBriefCard";
import { MeasurementsPanel } from "@/components/clinical/MeasurementsPanel";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { AdminProfileEditForm } from "@/components/admin/AdminProfileEditForm";
import { formatDateShort, formatDateLong, formatDateMonthDay } from "@/lib/utils/format";
import { USER_ROLE } from "@/lib/config/auth";
import { ADMIN_ROUTES, PORTAL_ROUTES, documentFileUrl } from "@/lib/config/routes";
import { computePatientSignal } from "@/lib/domain/signals";
import { SIGNAL_LABELS, SIGNAL_CHECKIN_WINDOW_DAYS } from "@/lib/config/admin";

export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== USER_ROLE.admin) redirect(PORTAL_ROUTES.dashboard);

  const { id } = await params;

  const patient = await db.query.users.findFirst({
    where: eq(users.id, id),
    with: {
      profile: true,
      assessmentResults: { orderBy: [desc(assessmentResults.completedAt)] },
      bookings: {
        orderBy: [desc(bookings.createdAt)],
        with: { clinician: { columns: { id: true, name: true } } },
      },
      documents: { orderBy: [desc(documents.createdAt)] },
      threads: {
        orderBy: [desc(threads.lastMessageAt)],
        with: {
          messages: { orderBy: [desc(threadMessages.createdAt)], limit: 1 },
        },
      },
      dailyCheckins: { orderBy: [asc(dailyCheckins.date)] },
      patientNotes: {
        orderBy: [desc(patientNotes.createdAt)],
        with: { admin: { columns: { name: true } } },
      },
      programmeAssignment: true,
    },
  });

  if (!patient) notFound();

  const [careRows, allClinicians] = await Promise.all([
    db.query.careTeam.findMany({
      where: eq(careTeam.patientId, id),
      columns: { clinicianId: true },
    }),
    db.query.users.findMany({
      where: eq(users.isClinician, true),
      columns: { id: true, name: true },
    }),
  ]);

  // Viewable as a patient: plain patients always; dual-role users (clinician/
  // admin) only once someone treats them — otherwise admin accounts would
  // surface here as empty "patients".
  if (patient.role !== USER_ROLE.patient && careRows.length === 0) notFound();

  const now = new Date();
  // dailyCheckins fetched ASC — signal function sorts internally, pass last window's worth
  const recentCheckins = [...patient.dailyCheckins].slice(-SIGNAL_CHECKIN_WINDOW_DAYS);
  const { signal, reason } = computePatientSignal({
    registeredAt: patient.createdAt,
    checkins: recentCheckins,
    assessments: patient.assessmentResults.slice(0, 2).map((a) => ({
      overallScore: a.overallScore,
      completedAt: a.completedAt,
    })),
    bookings: patient.bookings.slice(0, 1),
    now,
  });

  return (
    <div>
      {/* Header */}
      <div className={styles.patientHeader}>
        <Link href={ADMIN_ROUTES.patients} className={styles.patientBackLink}>
          ← All patients
        </Link>
        <div className={styles.patientHeaderRow}>
          <div>
            <h1 className={styles.pageTitle}>
              {patient.name ? (
                <em>{patient.name}</em>
              ) : (
                <span className={styles.patientNameMuted}>Unnamed patient</span>
              )}
            </h1>
            <p className={styles.pageSub}>
              {patient.email} · registered {formatDateLong(patient.createdAt)}
            </p>
          </div>
          <div className={styles.patientSignalBlock}>
            <span className={styles.signalBadge} data-signal={signal}>
              {SIGNAL_LABELS[signal]}
            </span>
            <p className={styles.signalReason}>{reason}</p>
          </div>
        </div>
      </div>

      {/* Progressive disclosure — the record is grouped by the question the
          clinician is answering, not dumped as one endless column. */}
      <SectionTabs
        ariaLabel="Patient record sections"
        sections={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <>
                <div className={styles.patientGrid}>
                  <PatientProfileCard profile={patient.profile} />
                  <AiBriefCard patientId={patient.id} />
                  <CareTeamCard
                    patientId={patient.id}
                    clinicians={allClinicians.filter((c) => c.id !== patient.id)}
                    members={careRows.map((r) => r.clinicianId)}
                  />
                </div>

                {patient.dailyCheckins.length > 0 && (
                  <div className={styles.cardWithTopMargin}>
                    <p className={styles.cardLabel}>Check-in trend</p>
                    <CheckinTrendChart
                      data={patient.dailyCheckins.map((c) => ({
                        date: formatDateMonthDay(c.date + "T00:00:00"),
                        sleep: c.sleep,
                        energy: c.energy,
                        mood: c.mood,
                        focus: c.focus,
                        stress: c.stress,
                      }))}
                    />
                    {/* Patient notes from check-ins — qualitative context for score dips */}
                    {(() => {
                      const withNotes = [...patient.dailyCheckins]
                        .filter((c) => c.notes)
                        .sort((a, b) => b.date.localeCompare(a.date));
                      if (withNotes.length === 0) return null;
                      return (
                        <div className={styles.checkinNotes}>
                          <p className={styles.checkinNotesLabel}>Patient notes</p>
                          {withNotes.map((c) => (
                            <div key={c.id} className={styles.checkinNoteRow}>
                              <span className={styles.checkinNoteDate}>
                                {formatDateShort(c.date + "T00:00:00")}
                              </span>
                              <span className={styles.checkinNoteText}>{c.notes}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {patient.assessmentResults.length >= 2 && (
                  <div className={styles.cardWithTopMargin}>
                    <p className={styles.cardLabel}>Assessment trend</p>
                    <AssessmentTrendChart
                      // results are fetched newest-first; the time axis reads left→right
                      data={patient.assessmentResults.toReversed().map((r) => ({
                        date: formatDateMonthDay(r.completedAt),
                        score: r.overallScore,
                      }))}
                    />
                  </div>
                )}
              </>
            ),
          },
          {
            id: "clinical",
            label: "Clinical",
            content: (
              <>
                <PatientGoalsCard patientId={patient.id} />

                <div className={styles.cardWithTopMargin}>
                  <p className={styles.cardLabel}>Clinical notes</p>
                  <AdminNotesForm
                    patientId={patient.id}
                    initialNotes={patient.patientNotes.map((n) => ({
                      id: n.id,
                      body: n.body,
                      createdAt: n.createdAt.toISOString(),
                      adminName: n.admin?.name ?? null,
                    }))}
                  />
                </div>

                <div className={styles.cardWithTopMargin}>
                  <p className={styles.cardLabel}>Programme assignment</p>
                  <ProgrammeAssignmentForm
                    patientId={patient.id}
                    clinician={await clinicianLabelFor(patient.id)}
                    initial={
                      patient.programmeAssignment
                        ? {
                            programme: patient.programmeAssignment.programme,
                            phase: patient.programmeAssignment.phase,
                            startDate: patient.programmeAssignment.startDate ?? null,
                            notes: patient.programmeAssignment.notes ?? null,
                          }
                        : null
                    }
                  />
                </div>
              </>
            ),
          },
          {
            id: "results",
            label: "Labs & vitals",
            content: (
              <div className={styles.cardWithTopMargin}>
                <p className={styles.cardLabel}>Measured results</p>
                <MeasurementsPanel patientId={patient.id} />
              </div>
            ),
          },
          {
            id: "activity",
            label: "Activity",
            content: (
              <>
                <div className={styles.patientGrid}>
                  <PatientAssessmentCard assessmentResults={patient.assessmentResults} />
                  <PatientBookingsCard bookings={patient.bookings} />
                  <PatientMessagesCard threads={patient.threads} patientId={patient.id} />
                </div>

                {/* Log a manual booking (phone or walk-in consultation) */}
                <div className={styles.cardWithTopMargin}>
                  <p className={styles.cardLabel}>Log booking</p>
                  <AdminBookingForm patientId={patient.id} />
                </div>

                <div className={styles.cardWithTopMargin}>
                  <p className={styles.cardLabel}>Documents ({patient.documents.length})</p>
                  {patient.documents.length > 0 && (
                    <div className={styles.docList}>
                      {patient.documents.map((doc) => (
                        <div key={doc.id} className={styles.docRow}>
                          <div>
                            <div className={styles.docTitle}>{doc.title}</div>
                            <div className={styles.docMeta}>
                              {formatDateShort(doc.createdAt)}
                              {doc.mimeType && ` · ${doc.mimeType}`}
                            </div>
                          </div>
                          <a
                            href={documentFileUrl(doc.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.docLink}
                          >
                            Open →
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                  <DocumentAddForm patientId={patient.id} />
                </div>
              </>
            ),
          },
          {
            id: "profile",
            label: "Edit profile",
            content: (
              <div className={styles.cardWithTopMargin}>
                <p className={styles.cardLabel}>Edit profile</p>
                <AdminProfileEditForm
                  patientId={patient.id}
                  initial={{ name: patient.name, ...patient.profile }}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
