import { Cpu, FileText, Users } from "lucide-react";
import Image from "next/image";

interface AuthPageProps {
  children: React.ReactNode;
}

const features = [
  {
    icon: <Cpu className="h-4 w-4" />,
    title: "AI Architecture Generation",
    description:
      "Describe your system, AI maps it to nodes and edges on a live canvas.",
  },
  {
    icon: <Users className="h-4 w-4" />,
    title: "Real-time Collaboration",
    description:
      "Live cursors, presence indicators, and shared node editing across your team.",
  },
  {
    icon: <FileText className="h-4 w-4" />,
    title: "Instant Spec Generation",
    description:
      "Export a complete Markdown technical spec directly from the canvas graph.",
  },
];

// Two-panel auth layout matching the reference design: branding and a
// prominent heading, description, and feature list on a slightly lighter
// surface (large screens only), centered Clerk form on the right.
export function AuthPage({ children }: AuthPageProps) {
  return (
    <main className="flex flex-1">
      <section className="hidden w-1/2 flex-col border-r border-surface-border bg-surface px-12 lg:flex xl:px-20">
        <div className="pt-10">
          <Image
            src="/branding/foster-ai-lockup.svg"
            alt="Foster AI"
            width={676}
            height={122}
            unoptimized
            className="h-12 w-auto"
          />
        </div>
        <div className="mt-24 max-w-md space-y-5">
          <h1 className="text-4xl font-semibold leading-tight text-copy-primary">
            More with less.
          </h1>
          <p className="text-lg leading-relaxed text-copy-secondary">
            Full-stack systems architecture, engineered with intent.
          </p>
        </div>
        <ul className="mt-16 space-y-8">
          {features.map((feature) => (
            <li key={feature.title} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-dim text-brand">
                {feature.icon}
              </span>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-copy-primary">
                  {feature.title}
                </h2>
                <p className="text-sm leading-relaxed text-copy-muted">
                  {feature.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex-1" />
        <p className="pb-8 text-sm text-copy-faint">
          © 2026 Phoenix Rising Labs. All rights reserved.
        </p>
      </section>
      <section className="flex flex-1 items-center justify-center px-6 py-10">
        {children}
      </section>
    </main>
  );
}
