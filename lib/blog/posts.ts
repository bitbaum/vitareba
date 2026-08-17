import type { routing } from "@/i18n/routing";

export type Locale = (typeof routing.locales)[number];

type PostTranslation = {
  title: string;
  excerpt: string;
  body: string[];
};

export type BlogPost = {
  slug: string;
  /** ISO date (YYYY-MM-DD) — static content, not a runtime timestamp. */
  publishedAt: string;
  translations: Record<Locale, PostTranslation>;
};

/**
 * SSOT for every blog post. Adding one is one entry here — no new route, no
 * schema, no CMS: app/[locale]/blog/page.tsx and [slug]/page.tsx both derive
 * from this array.
 */
export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "why-vita",
    publishedAt: "2026-08-17",
    translations: {
      en: {
        title: "Why Vita",
        excerpt:
          "ADHD and metabolic health are one conversation that medicine usually splits into two. Here is what we are building instead, and why the platform itself has to be built the same way.",
        body: [
          "Untreated ADHD does not stay in the mind. It shows up in sleep, in inflammation, in how the body ages — the numbers are in the hallway of this site, and they are the reason metabolic psychiatry and longevity medicine sit under one clinical roof here instead of two separate referrals. That is the medical premise Vita was built on, and it has not changed.",
          "What has changed is how much of that care now happens between visits — daily check-ins, trend charts, secure messages, a booking calendar that actually reflects who is free. A clinic that asks a patient about mood and sleep every day needs software as careful as the medicine it supports, or the software becomes the thing that erodes trust in the care.",
          "So the platform is built on the same principle the clinic is: nothing about your care should live in two places that can disagree. Who treats you is answered in exactly one place, and it is always visible to you. You choose your clinician — not the other way around — and you can switch, or add a second, whenever your care calls for it. A doctor who has closed their intake stays visible to the patients who already know them; it only ever stops a stranger from being added mid-practice.",
          "Messaging works the same way. It is a direct, secure line to whoever treats you — not a ticket into a shared inbox — and an AI assistant can sit inside that thread when you want a second pass on a question before your clinician answers it. It is there to help you both think, never to answer in your clinician's place, and it says so plainly whenever it speaks.",
          "The Inflection Edge is the first instrument on this platform, not the only one it was built to hold. Every assessment, every measurement, every goal tracked here is designed to be additive — the record grows as the toolkit grows, without a rewrite each time medicine adds a new question worth asking.",
          "That is the whole idea: metabolic psychiatry and systemic longevity, in one place, held by software that tells you the truth about your own record as plainly as your clinician does.",
        ],
      },
      de: {
        title: "Warum Vita",
        excerpt:
          "ADHS und metabolische Gesundheit sind ein einziges Thema, das die Medizin meist in zwei Sprechzimmer aufteilt. Das bauen wir stattdessen — und warum die Plattform selbst nach demselben Prinzip funktionieren muss.",
        body: [
          "Unbehandeltes ADHS bleibt nicht im Kopf. Es zeigt sich im Schlaf, in Entzündungswerten, im Zelltempo des Alterns — die Zahlen dazu stehen auf dieser Website, und sie sind der Grund, warum metabolische Psychiatrie und Longevity-Medizin hier unter einem klinischen Dach stehen statt in zwei getrennten Überweisungen. Das ist die medizinische Prämisse, auf der Vita aufgebaut wurde, und sie hat sich nicht geändert.",
          "Was sich geändert hat: Wie viel dieser Betreuung heute zwischen den Terminen stattfindet — tägliche Check-ins, Verlaufskurven, sichere Nachrichten, ein Buchungskalender, der wirklich zeigt, wer frei ist. Eine Praxis, die Patient:innen täglich nach Stimmung und Schlaf fragt, braucht eine Software, die so sorgfältig gebaut ist wie die Medizin, die sie trägt — sonst wird die Software selbst zu dem, was das Vertrauen in die Behandlung untergräbt.",
          "Die Plattform folgt deshalb demselben Prinzip wie die Praxis: Nichts an Ihrer Behandlung darf an zwei Stellen stehen, die sich widersprechen können. Wer Sie behandelt, wird an genau einer Stelle beantwortet — und ist für Sie immer sichtbar. Sie wählen Ihre Klinikerin oder Ihren Kliniker, nicht umgekehrt, und Sie können jederzeit wechseln oder eine zweite Person hinzufügen, wenn Ihre Behandlung das verlangt. Eine Ärztin, die keine neuen Patient:innen mehr aufnimmt, bleibt für alle sichtbar, die sie bereits kennen — es verhindert nur, dass mitten in der Praxis eine fremde Person neu zugeteilt wird.",
          "Nachrichten funktionieren nach demselben Prinzip. Es ist eine direkte, sichere Leitung zu der Person, die Sie behandelt — kein Ticket in einem gemeinsamen Posteingang — und ein KI-Assistent kann in diesem Gespräch mitdenken, wenn Sie eine Frage vor der Antwort Ihrer Klinikerin noch einmal durchdenken möchten. Er ist da, um beiden Seiten beim Denken zu helfen, nie um anstelle Ihrer Klinikerin zu antworten, und er sagt das jedes Mal klar dazu.",
          "Der Inflection Edge ist das erste Instrument auf dieser Plattform, nicht das einzige, für das sie gebaut wurde. Jede Untersuchung, jede Messung, jedes Ziel, das hier erfasst wird, ist additiv angelegt — die Akte wächst mit dem Instrumentarium, ohne dass jede neue sinnvolle medizinische Frage eine neue Software erfordert.",
          "Das ist die ganze Idee: metabolische Psychiatrie und systemische Longevity an einem Ort, getragen von einer Software, die Ihnen die Wahrheit über Ihre eigene Akte genauso klar sagt wie Ihre Klinikerin.",
        ],
      },
      fr: {
        title: "Pourquoi Vita",
        excerpt:
          "Le TDAH et la santé métabolique ne forment qu'un seul sujet que la médecine sépare généralement en deux. Voici ce que nous construisons à la place — et pourquoi la plateforme elle-même doit suivre le même principe.",
        body: [
          "Le TDAH non traité ne reste pas dans la tête. Il se manifeste dans le sommeil, dans l'inflammation, dans le rythme du vieillissement cellulaire — les chiffres figurent sur ce site, et c'est pourquoi la psychiatrie métabolique et la médecine de la longévité sont réunies ici sous un même toit clinique plutôt que réparties entre deux adresses différentes. C'est la prémisse médicale sur laquelle Vita a été fondée, et elle n'a pas changé.",
          "Ce qui a changé, c'est la part de ce suivi qui se joue désormais entre les consultations — bilans quotidiens, courbes d'évolution, messages sécurisés, un calendrier de réservation qui reflète vraiment les disponibilités réelles. Une clinique qui interroge chaque jour ses patients sur leur humeur et leur sommeil a besoin d'un logiciel aussi rigoureux que la médecine qu'il soutient, sinon le logiciel devient précisément ce qui érode la confiance dans le suivi.",
          "La plateforme suit donc le même principe que la clinique : rien concernant votre suivi ne doit exister à deux endroits susceptibles de se contredire. Qui vous soigne trouve réponse en un seul et unique endroit, toujours visible pour vous. C'est vous qui choisissez votre clinicien — et non l'inverse — et vous pouvez en changer, ou en ajouter un second, dès que votre suivi l'exige. Un médecin qui a fermé ses admissions reste visible pour les patients qui le connaissent déjà ; cela empêche seulement qu'un inconnu lui soit assigné en cours de pratique.",
          "La messagerie fonctionne selon le même principe. C'est une ligne directe et sécurisée vers la personne qui vous soigne — pas un ticket dans une boîte de réception partagée — et un assistant IA peut intervenir dans cette conversation lorsque vous souhaitez reformuler une question avant la réponse de votre clinicien. Il est là pour aider les deux parties à réfléchir, jamais pour répondre à la place de votre clinicien, et il le précise clairement à chaque intervention.",
          "L'Inflection Edge est le premier instrument de cette plateforme, pas le seul pour lequel elle a été conçue. Chaque évaluation, chaque mesure, chaque objectif suivi ici est pensé pour s'ajouter aux précédents — le dossier grandit avec les outils, sans qu'il faille tout reconstruire chaque fois que la médecine ajoute une question qui mérite d'être posée.",
          "C'est toute l'idée : la psychiatrie métabolique et la longévité systémique réunies en un seul lieu, portées par un logiciel qui vous dit la vérité sur votre propre dossier aussi clairement que votre clinicien.",
        ],
      },
    },
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
