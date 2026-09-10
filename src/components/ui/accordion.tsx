import * as React from 'react'
import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Accordion = AccordionPrimitive.Root

export function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return <AccordionPrimitive.Item data-slot="accordion-item" className={cn('border-b last:border-b-0', className)} {...props} />
}

export function AccordionTrigger({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return <AccordionPrimitive.Header className="flex"><AccordionPrimitive.Trigger data-slot="accordion-trigger" className={cn('flex flex-1 items-center justify-between gap-4 py-4 text-left text-sm font-medium outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&[data-state=open]>svg]:rotate-180', className)} {...props}>{children}<ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform" /></AccordionPrimitive.Trigger></AccordionPrimitive.Header>
}

export function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return <AccordionPrimitive.Content data-slot="accordion-content" className="overflow-hidden text-sm" {...props}><div className={cn('pb-5', className)}>{children}</div></AccordionPrimitive.Content>
}
