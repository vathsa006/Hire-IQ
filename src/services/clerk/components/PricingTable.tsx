import { SignInButton, SignUpButton, SignedIn, SignedOut } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { CheckIcon } from "lucide-react"

export function PricingTable() {
  const plans = [
    {
      name: "Starter",
      price: "$0",
      description: "Perfect for trying out Hire IQ",
      features: [
        "1 Active Job Listing",
        "Standard local search matching",
        "Clerk secure authentication",
      ],
      buttonText: "Get Started",
      featured: false,
    },
    {
      name: "Professional",
      price: "$99",
      period: "/mo",
      description: "Ideal for growing organizations",
      features: [
        "Up to 3 Active Job Listings",
        "1 Featured Job Listing (displays at top of board)",
        "Premium local search matching",
        "Clerk secure authentication",
        "Priority support",
      ],
      buttonText: "Upgrade to Pro",
      featured: true,
    },
    {
      name: "Enterprise",
      price: "$299",
      period: "/mo",
      description: "For high-volume recruitment needs",
      features: [
        "Up to 15 Active Job Listings",
        "Unlimited Featured Job Listings",
        "Dedicated account manager",
        "SLA guarantee",
      ],
      buttonText: "Contact Sales",
      featured: false,
    },
  ]

  return (
    <div className="w-full max-w-6xl mx-auto py-12 px-4">
      <div className="text-center space-y-4 mb-12">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Plans for organizations of all sizes
        </h2>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Choose a plan that fits your recruiting pipeline. All plans include secure user and organization management.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`flex flex-col justify-between p-8 rounded-2xl border bg-card text-card-foreground shadow-sm transition-all relative ${
              plan.featured
                ? "border-primary ring-2 ring-primary/20 scale-105 z-10"
                : "border-border"
            }`}
          >
            {plan.featured && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
                Most Popular
              </span>
            )}

            <div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold">{plan.name}</h3>
                <p className="text-sm text-muted-foreground min-h-[40px]">
                  {plan.description}
                </p>
              </div>

              <div className="mt-4 flex items-baseline text-card-foreground">
                <span className="text-5xl font-extrabold tracking-tight">
                  {plan.price}
                </span>
                {plan.period && (
                  <span className="ml-1 text-xl font-semibold text-muted-foreground">
                    {plan.period}
                  </span>
                )}
              </div>

              <ul className="mt-8 space-y-4 border-t pt-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start">
                    <CheckIcon className="size-5 text-primary shrink-0 mr-3" />
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 pt-6 border-t">
              <SignedOut>
                <SignUpButton mode="modal" fallbackRedirectUrl="/employer/pricing">
                  <Button className="w-full" variant={plan.featured ? "default" : "outline"}>
                    {plan.buttonText}
                  </Button>
                </SignUpButton>
              </SignedOut>
              <SignedIn>
                <Button className="w-full" variant={plan.featured ? "default" : "outline"} asChild>
                  <a
                    href="https://dashboard.clerk.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Manage via Clerk
                  </a>
                </Button>
              </SignedIn>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
