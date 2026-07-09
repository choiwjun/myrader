import { CreatorAppChrome } from "@/app/creator/_components/CreatorAppChrome";
import type { ReactNode } from "react";

export default function CreatorLayout({ children }: { readonly children: ReactNode }) {
  return <CreatorAppChrome>{children}</CreatorAppChrome>;
}
