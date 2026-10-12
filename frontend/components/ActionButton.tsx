import { Button, type ButtonProps, type ButtonVariant } from "@tokenring-ai/one-frontend/ui";

type VariantName = "primary" | "secondary" | "success" | "danger";

/** @deprecated Import `Button` from `@tokenring-ai/one-frontend/ui` instead. */
export type ActionButtonVariant = VariantName;

const VARIANTS: Record<VariantName, ButtonVariant> = {
  primary: "primary",
  secondary: "secondary",
  success: "primary",
  danger: "danger",
};

export interface ActionButtonProps extends Omit<ButtonProps, "variant"> {
  variant?: VariantName;
}

/** Toolbar button. `success` is the accent button; new code should pass `primary`. */
export default function ActionButton({ variant = "secondary", ...rest }: ActionButtonProps) {
  return <Button variant={VARIANTS[variant]} {...rest} />;
}
