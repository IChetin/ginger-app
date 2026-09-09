import { Drawer } from "@base-ui/react/drawer";

export function ProfileSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Backdrop className="bg-scrim fixed inset-0 z-40" />
        <Drawer.Viewport className="fixed inset-0 z-40 flex items-end justify-center">
          <Drawer.Popup className="border-line-strong bg-surface max-h-[88vh] w-full max-w-[420px] overflow-y-auto rounded-t-lg border border-b-0 px-5 pt-2.5 pb-[calc(20px+env(safe-area-inset-bottom))] outline-none">
            <div className="bg-line-strong mx-auto mb-3.5 h-1 w-9 rounded-full" />
            <Drawer.Title className="text-ink text-[19px] font-extrabold">{title}</Drawer.Title>
            <Drawer.Description className={description ? "text-ink-2 mt-1 text-[13px]" : "sr-only"}>
              {description ?? title}
            </Drawer.Description>
            <div className="mt-4">{children}</div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
