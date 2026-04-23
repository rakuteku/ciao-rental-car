import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdminSettings,
  useUpdateAdminSettings,
  getGetAdminSettingsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const settingsSchema = z.object({
  airportPickupFee: z.coerce.number().min(0, "Must be 0 or more"),
  airportDropoffFee: z.coerce.number().min(0, "Must be 0 or more"),
});

type SettingsForm = z.infer<typeof settingsSchema>;

export function AdminSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useGetAdminSettings({
    query: { queryKey: getGetAdminSettingsQueryKey() },
  });

  const updateSettings = useUpdateAdminSettings();

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      airportPickupFee: 9800,
      airportDropoffFee: 9800,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        airportPickupFee: settings.airportPickupFee,
        airportDropoffFee: settings.airportDropoffFee,
      });
    }
  }, [settings, form]);

  function onSubmit(data: SettingsForm) {
    updateSettings.mutate(
      { data },
      {
        onSuccess: () => {
          toast({ title: "Settings saved", description: "Airport fees updated successfully." });
          queryClient.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to save settings.",
            variant: "destructive",
          });
        },
      }
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-serif font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage pricing rules and fees for your rental service.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Airport Fees</CardTitle>
          <CardDescription>
            These fees are automatically added when customers select New Chitose Airport
            as their pickup or drop-off location.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-32" />
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="airportPickupFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Airport Pickup Fee (¥)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">¥</span>
                          <Input
                            type="number"
                            min={0}
                            step={100}
                            className="pl-7"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Added when pickup location is New Chitose Airport.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="airportDropoffFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Airport Drop-off Fee (¥)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">¥</span>
                          <Input
                            type="number"
                            min={0}
                            step={100}
                            className="pl-7"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Added when return location is New Chitose Airport.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="bg-muted/40 rounded p-4 space-y-2 text-sm">
                  <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Current Pricing Preview</p>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <span className="text-muted-foreground">Airport Pickup Fee</span>
                    </div>
                    <div className="text-right font-medium tabular-nums">
                      ¥{(form.watch("airportPickupFee") || 0).toLocaleString()}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Airport Drop-off Fee</span>
                    </div>
                    <div className="text-right font-medium tabular-nums">
                      ¥{(form.watch("airportDropoffFee") || 0).toLocaleString()}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Both (max possible airport surcharge)</span>
                    </div>
                    <div className="text-right font-bold tabular-nums">
                      ¥{((form.watch("airportPickupFee") || 0) + (form.watch("airportDropoffFee") || 0)).toLocaleString()}
                    </div>
                  </div>
                </div>

                <Button type="submit" disabled={updateSettings.isPending}>
                  {updateSettings.isPending ? "Saving…" : "Save Settings"}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
