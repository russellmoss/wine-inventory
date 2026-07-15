"use client";

import React from "react";
import { Button } from "@/components/ui";
import styles from "./developer.module.css";

export default function DeveloperError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section className={styles.workspace} role="alert">
      <header className={styles.header}>
        <span className={styles.subtle}>Developer</span>
        <h1>Developer feedback could not load</h1>
      </header>
      <p className={styles.subtle}>The queue state is unchanged. Retry the bounded developer read.</p>
      <div>
        <Button onClick={() => unstable_retry()}>Retry</Button>
      </div>
    </section>
  );
}
