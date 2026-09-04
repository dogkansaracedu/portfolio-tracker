import { useState, type ComponentProps } from "react"
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
import { FUEL_CATEGORY, VEHICLE_COPY } from "@/lib/constants/vehicle"
import { fromUsdOnDate } from "@/lib/pnl/currency"
import { homeDayIso } from "@/lib/config"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import { CostOfOwnershipCard } from "@/components/vehicle/CostOfOwnershipCard"
import { CostEntryForm } from "@/components/vehicle/CostEntryForm"
import { CostLedger } from "@/components/vehicle/CostLedger"
import { FuelCard } from "@/components/vehicle/FuelCard"
import { MaintenanceChart } from "@/components/vehicle/MaintenanceChart"
import { NextServiceCard } from "@/components/vehicle/NextServiceCard"
import { MaintenanceItemForm } from "@/components/vehicle/MaintenanceItemForm"
import { VehicleForm } from "@/components/vehicle/VehicleForm"
import { VehicleReadingsCard } from "@/components/vehicle/VehicleReadingsCard"
import type { MaintenanceItemState } from "@/lib/vehicle"
import type {
  Vehicle,
  VehicleCostEntry,
  VehicleMaintenanceItem,
} from "@/types/database"

/** "Fiat Egea 1.6 Multijet · 2019 · 34 ABC 123" — whichever of those the
 *  owner filled in, in that order. Empty string when none are set. */
function vehicleSubtitle(vehicle: Vehicle): string {
  return [
    [vehicle.make, vehicle.model].filter(Boolean).join(" "),
    vehicle.model_year === null ? "" : String(vehicle.model_year),
    vehicle.plate ?? "",
  ]
    .filter((part) => part !== "")
    .join(" · ")
}

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

  const { rates } = useTransactionData()
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const {
    vehicles,
    vehicle,
    items,
    entries,
    odometer,
    plan,
    service,
    serviceBundle,
    lastService,
    nextUp,
    cost,
    opportunity,
    fuel,
    monthlyFuel,
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
  const [prefillValues, setPrefillValues] = useState<
    ComponentProps<typeof CostEntryForm>["prefillValues"]
  >(undefined)
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
    setPrefillValues(undefined)
    setCostFormOpen(true)
  }

  /**
   * Turn the monthly estimate into a real entry.
   *
   * The amount is prefilled in lira, since that is the currency every cost of
   * running a car here is paid in and the form defaults to it. The estimate is
   * USD-anchored, so it converts back at today's rate — the one place in this
   * component that is right, because the row being created is dated today.
   */
  const openLogMonthlyFuel = () => {
    if (!monthlyFuel) return
    setEditingEntry(null)
    setPrefillItemIds([])
    setPrefillValues({
      category: FUEL_CATEGORY,
      amount: fromUsdOnDate(monthlyFuel.costUsd, "TRY", homeDayIso(), rates)
        .toFixed(0),
      litres: monthlyFuel.litres.toFixed(1),
      note: VEHICLE_COPY.monthlyFuelNote,
    })
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

      {/* The car's own identity. It earns a line because `PageHeading` is
          desktop-only, so on a phone this is the only thing that says which
          car the figures below belong to — and it is what the make / model /
          year / plate fields are for. */}
      <p className="text-sm">
        <span className="font-medium">{vehicle.name}</span>
        {vehicleSubtitle(vehicle) && (
          <span className="text-muted-foreground">
            {" · "}
            {vehicleSubtitle(vehicle)}
          </span>
        )}
      </p>

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
        {/* A second car was storable, scopable and switchable from the day
            this shipped — but this button existed only in the empty state, so
            the switcher above could never appear. The whole multi-car path was
            unreachable for want of an entry point. */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditingVehicle(false)
            setVehicleFormOpen(true)
          }}
        >
          {VEHICLE_COPY.addVehicle}
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
          vehicle={vehicle}
          valueMissing={vehicle.current_value === null}
        />
      )}

      {/* 2. What needs doing, the two readings that decide it, and fuel —
             short cards in one band. Each alone at full content width wasted
             most of a desktop screen and threw its own labels and figures a
             thousand pixels apart. `items-start` stops the short ones
             stretching to match the readings card, which is the tallest.
             The third column is reserved only when there IS fuel data:
             asking for three columns and rendering two left a 368px hole. */}
      <div
        className="grid items-start gap-6 lg:grid-cols-2 xl:grid-cols-3"
      >
        <NextServiceCard
          service={service}
          bundle={serviceBundle}
          lastService={lastService}
          nextUp={nextUp}
          onLogService={openAddCost}
        />
        {odometer && (
          <VehicleReadingsCard vehicle={vehicle} odometer={odometer} />
        )}
        {fuel && (
          <FuelCard
            fuel={fuel}
            monthly={monthlyFuel}
            onLogMonth={openLogMonthlyFuel}
          />
        )}
      </div>

      {/* 3. The plan it all comes from, then the ledger. */}
      <MaintenanceChart
        plan={plan}
        onEdit={openEditItem}
        onDelete={(state) => setDeletingItem(state.item)}
      />

      <CostLedger
        entries={entries}
        byGroup={cost?.byGroup ?? []}
        unpricedEntries={cost?.unpricedEntries ?? 0}
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
        /* Land on the car just created rather than leaving the page on the
           previous one — otherwise adding a second car looks like nothing
           happened until the switcher is noticed. */
        onCreated={(id) => {
          setSelectedId(id)
          void reported(seedPlan(id))
        }}
      />
      <CostEntryForm
        open={costFormOpen}
        onOpenChange={setCostFormOpen}
        vehicleId={vehicle.id}
        items={items}
        entry={editingEntry}
        prefillItemIds={prefillItemIds}
        prefillValues={prefillValues}
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
