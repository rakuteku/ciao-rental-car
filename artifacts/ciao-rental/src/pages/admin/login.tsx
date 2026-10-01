import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAdminLogin } from "@workspace/api-client-react";
import { ArrowLeft, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export function AdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const login = useAdminLogin();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  function onSubmit(data: z.infer<typeof loginSchema>) {
    login.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Logged in successfully" });
        setLocation("/admin/dashboard");
      },
      onError: () => {
        toast({ title: "Login failed", description: "Invalid credentials", variant: "destructive" });
      }
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))] px-4 py-10">
      <div className="w-full max-w-md">
        <Card className="overflow-hidden border-border bg-card shadow-md">
          <CardHeader className="space-y-4 px-7 pb-5 pt-8 sm:px-9">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-primary text-primary-foreground" aria-hidden="true">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div className="space-y-2 text-center">
              <CardTitle className="text-2xl font-bold tracking-normal text-foreground">CIAO Admin</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Enter your credentials to access the operations console.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-7 pb-8 sm:px-9">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input data-testid="input-admin-username" autoComplete="username" placeholder="admin" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input data-testid="input-admin-password" autoComplete="current-password" type="password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button data-testid="button-admin-login" type="submit" className="mt-1 h-11 w-full font-semibold" disabled={login.isPending}>
                  {login.isPending ? "Logging in..." : "Login"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
        <Link href="/" className="mx-auto mt-6 inline-flex min-h-10 items-center justify-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to CIAO Sapporo
        </Link>
      </div>
    </div>
  );
}