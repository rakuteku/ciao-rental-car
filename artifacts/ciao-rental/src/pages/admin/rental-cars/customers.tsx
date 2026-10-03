import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Search, ShieldCheck, UserRoundX } from "lucide-react";
import { useAdminCustomers, useUpdateAdminCustomer } from "@/hooks/use-rental-operations";
import { useLanguage } from "@/lib/language";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function AdminRentalCustomers() {
  const { language } = useLanguage();
  const ja = language === "ja";
  const t = (en: string, jp: string) => ja ? jp : en;
  const { toast } = useToast();
  const { data = [], isLoading } = useAdminCustomers();
  const updateCustomer = useUpdateAdminCustomer();
  const [search, setSearch] = useState("");
  const customers = Array.isArray(data) ? data as Record<string, any>[] : [];
  const filtered = useMemo(() => customers.filter((customer) => {
    const query = search.trim().toLowerCase();
    return !query || customer.email.toLowerCase().includes(query) || customer.fullName.toLowerCase().includes(query) || String(customer.id).includes(query);
  }), [customers, search]);

  const changeStatus = (customer: Record<string, any>) => {
    const status = customer.status === "active" ? "suspended" : "active";
    updateCustomer.mutate({ id: customer.id, status }, {
      onSuccess: () => toast({ title: t("Customer account updated", "顧客アカウントを更新しました") }),
      onError: (error: Error) => toast({ title: t("Update failed", "更新できませんでした"), description: error.message, variant: "destructive" }),
    });
  };

  return <div className="mx-auto max-w-7xl space-y-6 p-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><h1 className="text-3xl font-serif font-bold">{t("Customers", "顧客管理")}</h1><p className="mt-1 text-muted-foreground">{t("Manage end-user accounts and review their rental bookings.", "エンドユーザーのアカウントとレンタカー予約を管理します。")}</p></div>
      <div className="relative w-full sm:w-80"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search name, email or ID", "氏名・メール・IDで検索")} /></div>
    </div>
    <div className="overflow-x-auto border bg-card">
      <Table><TableHeader><TableRow><TableHead>{t("Customer", "顧客")}</TableHead><TableHead>{t("Language", "言語")}</TableHead><TableHead>{t("Bookings", "予約")}</TableHead><TableHead>{t("Last login", "最終ログイン")}</TableHead><TableHead>{t("Status", "状態")}</TableHead><TableHead className="text-right">{t("Actions", "操作")}</TableHead></TableRow></TableHeader>
      <TableBody>{isLoading ? <TableRow><TableCell colSpan={6} className="py-10 text-center">{t("Loading...", "読み込み中...")}</TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{t("No customer accounts found.", "顧客アカウントがありません。")}</TableCell></TableRow> : filtered.map((customer) => <TableRow key={customer.id}>
        <TableCell><p className="font-semibold">{customer.fullName}</p><p className="text-sm text-muted-foreground">{customer.email}</p>{customer.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}</TableCell>
        <TableCell>{customer.preferredLanguage}</TableCell>
        <TableCell><div className="space-y-1"><span className="font-semibold">{customer.bookings?.length ?? 0}</span>{customer.bookings?.slice(0, 2).map((booking: Record<string, any>) => <Link key={booking.id} href={`/admin/rental-cars/reservations/${booking.id}`} className="block text-xs text-primary underline">#{booking.id} · {booking.vehicleTitle}</Link>)}</div></TableCell>
        <TableCell>{customer.lastLoginAt ? new Date(customer.lastLoginAt).toLocaleString() : t("Never", "未ログイン")}</TableCell>
        <TableCell><Badge variant={customer.status === "active" ? "default" : "destructive"}>{customer.status}</Badge></TableCell>
        <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => changeStatus(customer)} disabled={updateCustomer.isPending}>{customer.status === "active" ? <><UserRoundX className="mr-2 size-4" />{t("Suspend", "停止")}</> : <><ShieldCheck className="mr-2 size-4" />{t("Activate", "有効化")}</>}</Button></TableCell>
      </TableRow>)}</TableBody></Table>
    </div>
  </div>;
}
