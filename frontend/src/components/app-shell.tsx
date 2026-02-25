"use client";

import { type ReactNode } from "react";
import { Header } from "./header";
import { AuthPrompt } from "./auth-prompt";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <AuthPrompt />
      {children}
    </>
  );
}
