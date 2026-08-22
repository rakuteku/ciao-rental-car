import { useAdminAudit } from "@/hooks/use-rental-operations";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export function AdminAudit() {
  const { data, isLoading } = useAdminAudit();
  const logs = Array.isArray(data) ? data : data?.items ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Audit Logs</h1>
        <p className="text-muted-foreground">Track changes to vehicles, pricing, and settings.</p>
      </div>

      <div className="bg-card border rounded-lg overflow-x-auto shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No audit logs found.</TableCell></TableRow>
            ) : (
              logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>{log.adminUser || "System"}</TableCell>
                  <TableCell><Badge variant="outline">{log.action}</Badge></TableCell>
                  <TableCell>{log.recordType} #{log.recordId}</TableCell>
                  <TableCell className="text-sm max-w-[300px] truncate">{JSON.stringify(log.newValue ?? log.previousValue ?? {})}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
