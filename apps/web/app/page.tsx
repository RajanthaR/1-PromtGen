import {
  parseEditorDraftSearchParams,
  type EditorDraftSearchParams,
} from "../src/editor/editor-draft";
import { EditorHome } from "../src/editor/editor-home";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<EditorDraftSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  return <EditorHome initialDraft={parseEditorDraftSearchParams(resolvedSearchParams)} />;
}
