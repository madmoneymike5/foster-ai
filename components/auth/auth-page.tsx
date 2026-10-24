import type { ReactNode } from "react";

interface AuthPageProps {
  children: ReactNode;
}

const features = [
  "Describe a system in plain English",
  "AI maps it onto a shared canvas",
  "Collaborate in real time",
  "Generate a technical spec",
];

// Two-panel auth layout: compact branding and a short text-only feature
// list on the left (large screens only), centered Clerk form on the right.
export function AuthPage({ children }: AuthPageProps) {
  return (
    <main className="flex flex-1">
      <section className="hidden w-1/2 flex-col justify-center gap-10 border-r border-surface-border px-12 lg:flex xl:px-20">
        <span className="text-lg font-semibold text-copy-primary">
          Foster AI
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-copy-primary">
            More with less.
          </h1>
          <p className="text-copy-secondary">
            Full-stack systems architecture, engineered with intent.
          </p>
        </div>
        <ul className="space-y-2">
          {features.map((feature) => (
            <li key={feature} className="text-sm text-copy-muted">
              {feature}
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-1 items-center justify-center px-6 py-10">
        {children}
      </section>
    </main>
  );
}
