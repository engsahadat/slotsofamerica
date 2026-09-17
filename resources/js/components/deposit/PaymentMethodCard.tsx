import { Check } from "lucide-react";

interface PaymentGateway {
  id: string;
  name: string;
  address: string;
  logo_url: string | null;
  qr_code_url: string | null;
  minimum_amount: number;
  instructions: string | null;
  deep_link: string | null;
}

interface Props {
  gateway: PaymentGateway;
  selected: boolean;
  onSelect: () => void;
}

export const PaymentMethodCard = ({ gateway, selected, onSelect }: Props) => (
  <button
    onClick={onSelect}
    className={`group relative rounded-xl border-2 p-4 text-left transition-all duration-200 w-full ${
      selected
        ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
        : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
    }`}
  >
    {selected && (
      <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full gradient-bg flex items-center justify-center">
        <Check className="h-3 w-3 text-primary-foreground" />
      </div>
    )}
    <div className="flex items-center gap-3">
      {gateway.logo_url ? (
        <img
          src={gateway.logo_url}
          alt={gateway.name}
          className="h-12 w-12 rounded-lg object-contain bg-muted/50 p-1 border border-border"
        />
      ) : (
        <div className="h-12 w-12 rounded-lg bg-muted border border-border flex items-center justify-center text-base font-bold text-muted-foreground">
          {gateway.name.charAt(0)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{gateway.name}</p>
        <p className="text-[11px] text-muted-foreground">Min: ${gateway.minimum_amount.toFixed(2)}</p>
      </div>
    </div>
  </button>
);
