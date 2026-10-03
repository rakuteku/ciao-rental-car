import { useState } from "react";
import { Link, useLocation } from "wouter";
import { CalendarDays, LogIn, LogOut, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useBookingLookup, useCustomerAccount, useCustomerLogin, useCustomerLogout, useCustomerRegister } from "@/hooks/use-rental-operations";
import { localizedPath, useLanguage, type Language } from "@/lib/language";

const copy = {
  en: { title: "My bookings", subtitle: "Sign in to see every CIAO rental booking linked to your email.", signIn: "Sign in", create: "Create account", guest: "Guest lookup", email: "Email address", password: "Password", name: "Full name", phone: "Phone number", register: "Create my account", noBookings: "No bookings are linked to this account yet.", upcoming: "Your bookings", logout: "Log out", booking: "Booking", pickup: "Pickup", return: "Return", view: "View booking", accessCode: "Booking access code", bookingId: "Booking ID", lookup: "Look up booking", passwordHint: "Use at least 8 characters.", accountIntro: "Customer account", guestIntro: "You can still open an existing reservation without creating an account." },
  ja: { title: "予約の確認", subtitle: "ログインすると、メールアドレスに紐づくCIAOレンタカー予約を確認できます。", signIn: "ログイン", create: "アカウント作成", guest: "ゲスト予約検索", email: "メールアドレス", password: "パスワード", name: "氏名", phone: "電話番号", register: "アカウントを作成", noBookings: "このアカウントに紐づく予約はまだありません。", upcoming: "予約一覧", logout: "ログアウト", booking: "予約", pickup: "貸出", return: "返却", view: "予約を見る", accessCode: "予約アクセスコード", bookingId: "予約ID", lookup: "予約を検索", passwordHint: "8文字以上で設定してください。", accountIntro: "お客様アカウント", guestIntro: "アカウントを作成せず、既存予約を検索することもできます。" },
  "zh-TW": { title: "我的預訂", subtitle: "登入後即可查看與電子郵件連結的所有 CIAO 租車預訂。", signIn: "登入", create: "建立帳戶", guest: "訪客查詢", email: "電子郵件", password: "密碼", name: "姓名", phone: "電話號碼", register: "建立我的帳戶", noBookings: "此帳戶目前沒有相關預訂。", upcoming: "您的預訂", logout: "登出", booking: "預訂", pickup: "取車", return: "還車", view: "查看預訂", accessCode: "預訂存取碼", bookingId: "預訂編號", lookup: "查詢預訂", passwordHint: "請使用至少 8 個字元。", accountIntro: "顧客帳戶", guestIntro: "您仍可在不建立帳戶的情況下查詢現有預訂。" },
} satisfies Record<Language, Record<string, string>>;

export function MyBookings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { language } = useLanguage();
  const t = copy[language];
  const accountQuery = useCustomerAccount();
  const login = useCustomerLogin();
  const register = useCustomerRegister();
  const logout = useCustomerLogout();
  const lookup = useBookingLookup();
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ fullName: "", email: "", phone: "", password: "" });
  const [guestForm, setGuestForm] = useState({ email: "", bookingId: "", accessCode: "" });
  const accountData = accountQuery.data as { account?: Record<string, any>; bookings?: Record<string, any>[] } | null | undefined;
  const mutationError = (error: Error) => toast({ title: error.message, variant: "destructive" });

  if (accountData?.account) {
    const bookings = accountData.bookings ?? [];
    return <div className="container min-h-[70vh] py-10 md:py-16">
      <div className="mb-8 flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-end">
        <div><p className="text-xs font-semibold uppercase text-muted-foreground">{t.accountIntro}</p><h1 className="mt-2 text-3xl font-serif font-bold">{t.title}</h1><p className="mt-2 text-muted-foreground">{accountData.account.email}</p></div>
        <Button variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut className="mr-2 size-4" />{t.logout}</Button>
      </div>
      <h2 className="mb-4 text-xl font-semibold">{t.upcoming}</h2>
      {bookings.length === 0 ? <div className="border py-12 text-center text-muted-foreground">{t.noBookings}</div> : <div className="space-y-3">{bookings.map((booking) => <article key={booking.id} className="grid gap-4 border p-5 md:grid-cols-[1fr_1fr_auto] md:items-center">
        <div><p className="text-xs uppercase text-muted-foreground">{t.booking} #{booking.id}</p><p className="mt-1 font-semibold">{booking.vehicleTitle}</p><Badge className="mt-2" variant="secondary">{booking.status}</Badge></div>
        <div className="grid grid-cols-2 gap-4 text-sm"><div><p className="text-muted-foreground">{t.pickup}</p><p>{new Date(booking.pickupAt).toLocaleString()}</p></div><div><p className="text-muted-foreground">{t.return}</p><p>{new Date(booking.returnAt).toLocaleString()}</p></div></div>
        <Link href={localizedPath(`/rentalcar/my-bookings/${booking.id}`, language)}><Button>{t.view}</Button></Link>
      </article>)}</div>}
    </div>;
  }

  return <div className="container min-h-[70vh] max-w-3xl py-10 md:py-16">
    <div className="mb-8 text-center"><h1 className="text-3xl font-serif font-bold">{t.title}</h1><p className="mt-2 text-muted-foreground">{t.subtitle}</p></div>
    <Card className="border-border/80 shadow-sm"><Tabs defaultValue="signin"><CardHeader><TabsList className="grid w-full grid-cols-3"><TabsTrigger value="signin">{t.signIn}</TabsTrigger><TabsTrigger value="create">{t.create}</TabsTrigger><TabsTrigger value="guest">{t.guest}</TabsTrigger></TabsList></CardHeader><CardContent>
      <TabsContent value="signin"><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); login.mutate(loginForm, { onError: mutationError }); }}><CardTitle>{t.signIn}</CardTitle><div className="space-y-2"><Label>{t.email}</Label><Input type="email" required value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} /></div><div className="space-y-2"><Label>{t.password}</Label><Input type="password" required value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} /></div><Button className="w-full" disabled={login.isPending}><LogIn className="mr-2 size-4" />{t.signIn}</Button></form></TabsContent>
      <TabsContent value="create"><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); register.mutate({ ...registerForm, preferredLanguage: language }, { onError: mutationError }); }}><CardTitle>{t.create}</CardTitle><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>{t.name}</Label><Input required value={registerForm.fullName} onChange={(e) => setRegisterForm({ ...registerForm, fullName: e.target.value })} /></div><div className="space-y-2"><Label>{t.phone}</Label><Input value={registerForm.phone} onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })} /></div></div><div className="space-y-2"><Label>{t.email}</Label><Input type="email" required value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} /></div><div className="space-y-2"><Label>{t.password}</Label><Input type="password" minLength={8} required value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} /><p className="text-xs text-muted-foreground">{t.passwordHint}</p></div><Button className="w-full" disabled={register.isPending}><UserPlus className="mr-2 size-4" />{t.register}</Button></form></TabsContent>
      <TabsContent value="guest"><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); lookup.mutate(guestForm, { onSuccess: () => setLocation(localizedPath(`/rentalcar/my-bookings/${guestForm.bookingId}`, language)), onError: mutationError }); }}><CardTitle>{t.guest}</CardTitle><CardDescription>{t.guestIntro}</CardDescription><div className="space-y-2"><Label>{t.email}</Label><Input type="email" required value={guestForm.email} onChange={(e) => setGuestForm({ ...guestForm, email: e.target.value })} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>{t.bookingId}</Label><Input required value={guestForm.bookingId} onChange={(e) => setGuestForm({ ...guestForm, bookingId: e.target.value })} /></div><div className="space-y-2"><Label>{t.accessCode}</Label><Input required value={guestForm.accessCode} onChange={(e) => setGuestForm({ ...guestForm, accessCode: e.target.value })} /></div></div><Button className="w-full" disabled={lookup.isPending}><Search className="mr-2 size-4" />{t.lookup}</Button></form></TabsContent>
    </CardContent></Tabs></Card>
    <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4" />{t.guestIntro}</div>
  </div>;
}
