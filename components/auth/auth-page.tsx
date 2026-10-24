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
      <section className="relative hidden w-1/2 border-r border-surface-border bg-elevated lg:block">
        <div className="absolute inset-x-0 top-0 px-12 pt-10 xl:px-20">
          <Image
            src="/branding/foster-ai-lockup.svg"
            alt="Foster AI"
            width={676}
            height={122}
            unoptimized
            className="h-12 w-auto"
          />
        </div>
        <div className="flex h-full flex-col justify-center px-12 py-24 xl:px-20">
          <div className="max-w-md space-y-5">
            <h1 className="text-4xl font-semibold leading-tight text-copy-primary">
              Design more with less.
            </h1>
            <p className="text-lg leading-relaxed text-copy-secondary">
              Full-stack systems architecture, engineered with intent: Describe your architecture in plain English. Foster AI visually maps it to a shared canvas your whole team can refine in real time.
            </p>
          </div>
          <ul className="mt-12 space-y-8">
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
        </div>
        <p className="absolute inset-x-0 bottom-0 px-12 pb-8 text-sm text-copy-faint xl:px-20">
          © 2026 Phoenix Rising Labs. All rights reserved.
        </p>
      </section>
      <section className="flex flex-1 items-center justify-center px-6 py-10">
        {children}
      </section>
    </main>
  );
}
