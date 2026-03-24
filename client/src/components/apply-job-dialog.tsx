import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Briefcase, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Job = {
  id: string;
  title: string;
  region?: string;
  location?: string;
};

const applySchema = z.object({
  fullNameEn: z.string().min(2, "Full name is required"),
  phone: z.string().min(9, "Phone number is required"),
  nationalId: z.string().min(5, "National ID or Iqama number is required"),
});
type ApplyForm = z.infer<typeof applySchema>;

export default function ApplyJobDialog({
  job,
  open,
  onOpenChange,
  onSuccess,
}: {
  job: Job | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: (jobId: string) => void;
}) {
  const { toast } = useToast();

  const form = useForm<ApplyForm>({
    resolver: zodResolver(applySchema),
    defaultValues: { fullNameEn: "", phone: "", nationalId: "" },
  });

  const apply = useMutation({
    mutationFn: async (data: ApplyForm) => {
      const ts = Date.now().toString(36).toUpperCase().slice(-4);
      const code = `CND-${data.nationalId.slice(-6)}-${ts}`;

      const candidate = await apiRequest("POST", "/api/candidates", {
        candidateCode: code,
        fullNameEn: data.fullNameEn,
        phone: data.phone,
        nationalId: data.nationalId,
      }).then((r) => r.json());

      await apiRequest("POST", "/api/applications", {
        candidateId: candidate.id,
        jobId: job!.id,
        status: "new",
      });

      return job!.id;
    },
    onSuccess: (jobId) => {
      toast({
        title: "Application submitted!",
        description: `Your application for "${job?.title}" has been received.`,
      });
      onSuccess(jobId);
      form.reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Failed to submit",
        description: "Please check your details and try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Apply for Position
          </DialogTitle>
          {job && (
            <DialogDescription className="text-muted-foreground">
              {job.title} · {job.region ?? job.location ?? "KSA"}
            </DialogDescription>
          )}
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => apply.mutate(d))} className="space-y-4 pt-1">
            <FormField control={form.control} name="fullNameEn" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                  Full Name (English)
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Mohammed Al-Harbi"
                    className="bg-muted/30 border-border"
                    data-testid="input-apply-name"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="nationalId" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                  National ID / Iqama No.
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. 1012345678"
                    className="bg-muted/30 border-border font-mono"
                    inputMode="numeric"
                    data-testid="input-apply-national-id"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                  Phone Number
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. 0512345678"
                    className="bg-muted/30 border-border font-mono"
                    inputMode="tel"
                    data-testid="input-apply-phone"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="border-border"
                onClick={() => onOpenChange(false)}
                data-testid="button-apply-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-primary text-primary-foreground font-bold min-w-[140px]"
                disabled={apply.isPending}
                data-testid="button-apply-submit"
              >
                {apply.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Submit Application"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
