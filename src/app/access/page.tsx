import { AccessScreen } from "@/components/auth/AccessScreen";
import { githubProviderConfigured } from "@/lib/auth-options";

export default function AccessPage() {
  return <AccessScreen githubConfigured={githubProviderConfigured} microsoftConfigured={false} />;
}
