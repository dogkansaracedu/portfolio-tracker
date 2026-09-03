import { useState } from "react"
import { Plus } from "lucide-react"
import { PageHeading } from "@/components/common/PageHeading"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { SegmentedControl } from "@/components/common/SegmentedControl"
import { useVehicle } from "@/hooks/useVehicle"
import { useVehicleContext } from "@/contexts/VehicleContext"
import { useReportedWrite } from "@/hooks/useReportedWrite"
import { VEHICLE_COPY } from "@/lib/constants/vehicle"
import { CostOfOwnershipCard } from "@/components/vehicle/CostOfOwnershipCard"
import { CostBreakdown } from "@/components/vehicle/CostBreakdown"
import { CostEntryForm } from "@/components/vehicle/CostEntryForm"
import { CostLedger } from "@/components/vehicle/CostLedger"
import { FuelCard } from "@/components/vehicle/FuelCard"
import {
  DueSummary,
  MaintenanceChart,
} from "@/components/vehicle/MaintenanceChart"
import { MaintenanceItemForm } from "@/components/vehicle/MaintenanceItemForm"
import { VehicleForm } from "@/components/vehicle/VehicleForm"
import { VehicleReadingsCard } from "@/components/vehicle/VehicleReadingsCard"
import type { MaintenanceItemState } from "@/lib/vehicle"
import type { VehicleCostEntry, VehicleMaintenanceItem } from "@/types/database"

/**
 * Component 17 — Vehicle. What the car has really cost (cash out plus the
 * value it lost) and what needs doing next.
 *
 * Nothing on this page touches the portfolio: no transaction, no holding, no
 * balance, no net worth, no P&L. It reads the portfolio's own return rate for
 * the capital-tied-up figure and writes nothing back. Car spending is already
 * inside the Budget page's "spent" residual, so this explains part of that
 * rather than adding to it.
 *
 * Reading order is deliberate: what it cost, what needs doing, then the raw
 * material both are derived from.
 */
export default function VehiclePage() {
  const { removeItem, removeEntry, removeVehicle, seedPlan, items: allItems } =
    useVehicleContext()
  const { error: writeError, reported } = useReportedWrite(
    VEHICLE_COPY.writeFailed,
  )

  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const {
    vehicles,
    vehicle,
    items,
    entries,
    odometer,
    plan,
    due,
    nextUp,
    cost,
    opportunity,
    fuel,
    loading,
    error,
  } = useVehicle(selectedId)

  // Dialog state. Each `null` doubles as "closed"; the boolean flags are for
  // the two dialogs that carry no subject.
  const [vehicleFormOpen, setVehicleFormOpen] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState(false)
  const [costFormOpen, setCostFormOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<VehicleCostEntry | null>(
    null,
  )
  const [prefillItemIds, setPrefillItemIds] = useState<string[]>([])
  const [itemFormOpen, setItemFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<VehicleMaintenanceItem | null>(
    null,
  )
  const [deletingEntry, setDeletingEntry] = useState<VehicleCostEntry | null>(
    null,
  )
  const [deletingItem, setDeletingItem] = useState<VehicleMaintenanceItem | null>(
    null,
  )
  const [deletingVehicle, setDeletingVehicle] = useState(false)

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeading
          title={VEHICLE_COPY.pageTitle}
          subtitle={VEHICLE_COPY.pageSubtitle}
        />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // ── No car yet.
  if (!vehicle) {
    return (
      <div className="space-y-6">
        <PageHeading
          title={VEHICLE_COPY.pageTitle}
          subtitle={VEHICLE_COPY.pageSubtitle}
        />
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <p className="text-sm font-medium">{VEHICLE_COPY.emptyTitle}</p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              {VEHICLE_COPY.emptyBody}
            </p>
            <Button onClick={() => setVehicleFormOpen(true)}>
              <Plus className="size-4" />
              {VEHICLE_COPY.addVehicle}
            </Button>
          </CardContent>
        </Card>
        <VehicleForm
          open={vehicleFormOpen}
          onOpenChange={setVehicleFormOpen}
          onCreated={(id) => void reported(seedPlan(id))}
        />
        {(error || writeError) && (
          <p className="text-sm text-red-500">{error ?? writeError}</p>
        )}
      </div>
    )
  }

  const openAddCost = (itemIds: string[] = []) => {
    setEditingEntry(null)
    setPrefillItemIds(itemIds)
    setCostFormOpen(true)
  }

  const openEditCost = (entry: VehicleCostEntry) => {
    setEditingEntry(entry)
    setPrefillItemIds([])
    setCostFormOpen(true)
  }

  const openEditItem = (state: MaintenanceItemState) => {
    setEditingItem(state.item)
    setItemFormOpen(true)
  }

  const nextSortOrder =
    allItems.reduce((max, i) => Math.max(max, i.sort_order), -1) + 1

  return (
    <div className="space-y-6">
      <PageHeading
        title={VEHICLE_COPY.pageTitle}
        subtitle={VEHICLE_COPY.pageSubtitle}
      />

      {/* The switcher appears only with more than one car — a control that
          offers one choice is not a choice. */}
      {vehicles.length > 1 && (
        <SegmentedControl
          value={vehicle.id}
          onChange={setSelectedId}
          options={vehicles.map((v) => ({ id: v.id, label: v.name }))}
          size="sm"
          ariaLabel={VEHICLE_COPY.switcherLabel}
        />
      )}

      {/* Actions. Buttons wrap on a narrow screen rather than shrinking. */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => openAddCost()}>
          <Plus className="size-4" />
          {VEHICLE_COPY.addCost}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditingItem(null)
            setItemFormOpen(true)
          }}
        >
          {VEHICLE_COPY.addItem}
        </Button>
        {items.length === 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void reported(seedPlan(vehicle.id))}
          >
            {VEHICLE_COPY.seedPlan}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditingVehicle(true)
            setVehicleFormOpen(true)
          }}
        >
          {VEHICLE_COPY.editVehicle}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => setDeletingVehicle(true)}
        >
          {VEHICLE_COPY.deleteVehicle}
        </Button>
      </div>

      {/* 1. What it cost. */}
      {cost && (
        <CostOfOwnershipCard
          cost={cost}
          opportunity={opportunity}
          valueMissing={vehicle.current_value === null}
        />
      )}

      {/* 2. What needs doing, then the plan it comes from. The due bundle and
             the breakdown share a row from `lg`; both are short lists. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DueSummary due={due} nextUp={nextUp} />
        {cost && <CostBreakdown byCategory={cost.byCategory} />}
      </div>

      <MaintenanceChart
        plan={plan}
        onEdit={openEditItem}
        onDelete={(state) => setDeletingItem(state.item)}
      />

      {/* 3. The raw material: readings, fuel, and the ledger. */}
      <div className="grid gap-6 lg:grid-cols-2">
        {odometer && (
          <VehicleReadingsCard vehicle={vehicle} odometer={odometer} />
        )}
        {fuel && <FuelCard fuel={fuel} />}
      </div>

      <CostLedger
        entries={entries}
        items={items}
        onEdit={openEditCost}
        onDelete={setDeletingEntry}
      />

      <p className="text-xs text-muted-foreground">
        {VEHICLE_COPY.boundaryNote}
      </p>

      {(error || writeError) && (
        <p className="text-sm text-red-500">{error ?? writeError}</p>
      )}

      {/* Dialogs */}
      <VehicleForm
        open={vehicleFormOpen}
        onOpenChange={(open) => {
          setVehicleFormOpen(open)
          if (!open) setEditingVehicle(false)
        }}
        vehicle={editingVehicle ? vehicle : null}
        onCreated={(id) => void reported(seedPlan(id))}
      />
      <CostEntryForm
        open={costFormOpen}
        onOpenChange={setCostFormOpen}
        vehicleId={vehicle.id}
        items={items}
        entry={editingEntry}
        prefillItemIds={prefillItemIds}
      />
      <MaintenanceItemForm
        open={itemFormOpen}
        onOpenChange={setItemFormOpen}
        vehicleId={vehicle.id}
        item={editingItem}
        nextSortOrder={nextSortOrder}
      />

      {/* Deletes are confirmed: each removes real history and none is undoable. */}
      <AlertDialog
        open={deletingEntry !== null}
        onOpenChange={(open) => !open && setDeletingEntry(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {VEHICLE_COPY.deleteCostConfirm}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {VEHICLE_COPY.closesItemsHint}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{VEHICLE_COPY.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deletingEntry) await reported(removeEntry(deletingEntry.id))
                setDeletingEntry(null)
              }}
            >
              {VEHICLE_COPY.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deletingItem !== null}
        onOpenChange={(open) => !open && setDeletingItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {VEHICLE_COPY.deleteItemConfirm}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {VEHICLE_COPY.deleteItemBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{VEHICLE_COPY.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deletingItem) await reported(removeItem(deletingItem.id))
                setDeletingItem(null)
              }}
            >
              {VEHICLE_COPY.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deletingVehicle}
        onOpenChange={setDeletingVehicle}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {VEHICLE_COPY.deleteVehicleConfirm}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {VEHICLE_COPY.deleteVehicleBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{VEHICLE_COPY.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await reported(removeVehicle(vehicle.id))
                setDeletingVehicle(false)
                setSelectedId(undefined)
              }}
            >
              {VEHICLE_COPY.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
