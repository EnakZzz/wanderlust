"use client";

import dynamic from "next/dynamic";

const RoutebookEditor = dynamic(() => import("./RoutebookEditor").then((mod) => mod.RoutebookEditor), {
  ssr: false,
  loading: () => <section id="editor" className="workspace workspace-loading" aria-busy="true" />
});

export function HomeEditorShell() {
  return <RoutebookEditor />;
}
