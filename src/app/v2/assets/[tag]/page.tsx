import { V2AssetScreen } from "@/components/v2/V2AssetScreen";

export default function Page({ params }: { params: { tag: string } }) {
  return <V2AssetScreen tag={params.tag} />;
}
