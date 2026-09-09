import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_REMINDER_OFFSETS,
  REMINDER_PRESET_LABELS,
  REMINDER_PRESET_OFFSETS,
} from "@/features/bookmarks/lib/reminderPresets";

const reminderOffsetsSchema = z.object({
  reminder_offsets: z.array(z.number()).min(1, "Выберите хотя бы одно напоминание"),
});

type ReminderOffsetsFormValues = z.infer<typeof reminderOffsetsSchema>;

type ReminderOffsetsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultOffsets?: number[];
  onSubmit: (offsets: number[]) => void | Promise<void>;
  isSubmitting?: boolean;
};

export function ReminderOffsetsDialog({
  open,
  onOpenChange,
  defaultOffsets = DEFAULT_REMINDER_OFFSETS,
  onSubmit,
  isSubmitting = false,
}: ReminderOffsetsDialogProps) {
  const form = useForm<ReminderOffsetsFormValues>({
    resolver: standardSchemaResolver(reminderOffsetsSchema),
    defaultValues: {
      reminder_offsets: defaultOffsets,
    },
    values: {
      reminder_offsets: defaultOffsets,
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Напоминания</DialogTitle>
          <DialogDescription>
            Выберите, за сколько до старта флайта прислать push-уведомление.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            await onSubmit(values.reminder_offsets);
          })}
        >
          <Controller
            control={form.control}
            name="reminder_offsets"
            render={({ field }) => (
              <div className="space-y-3">
                {REMINDER_PRESET_OFFSETS.map((offset) => {
                  const checked = field.value.includes(offset);
                  const inputId = `reminder-offset-${offset}`;
                  return (
                    <div key={offset} className="flex items-center gap-3">
                      <Checkbox
                        id={inputId}
                        checked={checked}
                        onCheckedChange={(nextChecked) => {
                          if (nextChecked) {
                            field.onChange([...field.value, offset]);
                            return;
                          }
                          field.onChange(field.value.filter((value) => value !== offset));
                        }}
                      />
                      <Label htmlFor={inputId}>{REMINDER_PRESET_LABELS[offset]}</Label>
                    </div>
                  );
                })}
              </div>
            )}
          />

          {form.formState.errors.reminder_offsets ? (
            <p className="text-sm text-rose-300">
              {form.formState.errors.reminder_offsets.message}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
