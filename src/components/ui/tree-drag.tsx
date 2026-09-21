import {
	type CollisionDetection,
	DndContext,
	type DragMoveEvent,
	DragOverlay,
	MouseSensor,
	pointerWithin,
	TouchSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

export type TreeDrop = {
	id: string;
	target: string;
	position: "before" | "after" | "inside";
};
const Context = createContext<{ drop: TreeDrop | null; active: string | null }>(
	{ drop: null, active: null },
);

type TreeDragProps = {
	children: ReactNode;
	canDrop: (drop: TreeDrop) => boolean;
	onDrop: (drop: TreeDrop) => void;
	label: (id: string) => string;
};

const collision: CollisionDetection = (args) =>
	pointerWithin(args).map((hit) => ({
		...hit,
		data: { ...hit.data, pointerY: args.pointerCoordinates?.y },
	}));

/** Gesture ownership only. The caller defines tree constraints and commits the move. */
export function TreeDrag({ children, canDrop, onDrop, label }: TreeDragProps) {
	const [active, setActive] = useState<string | null>(null);
	const [drop, setDrop] = useState<TreeDrop | null>(null);
	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 180, tolerance: 6 },
		}),
	);
	function locate(event: DragMoveEvent): TreeDrop | null {
		if (
			!event.over ||
			typeof event.active.id !== "string" ||
			typeof event.over.id !== "string"
		) {
			return null;
		}
		const rect = event.over.rect;
		const y = event.collisions?.[0]?.data?.pointerY;
		if (typeof y !== "number") {
			return null;
		}
		const fraction = (y - rect.top) / rect.height;
		let position: TreeDrop["position"] = "inside";
		if (fraction < 0.25) {
			position = "before";
		}
		if (fraction > 0.75) {
			position = "after";
		}
		// A line beneath an expanded header would falsely imply moving above its children.
		if (position === "after" && event.over.data.current?.expanded) {
			return null;
		}
		const next = { id: event.active.id, target: event.over.id, position };
		return canDrop(next) ? next : null;
	}
	function move(event: DragMoveEvent) {
		const next = locate(event);
		setDrop((current) =>
			current?.id === next?.id &&
			current?.target === next?.target &&
			current?.position === next?.position
				? current
				: next,
		);
	}
	function clear() {
		setActive(null);
		setDrop(null);
	}
	const context = useMemo(() => ({ active, drop }), [active, drop]);
	return (
		<DndContext
			sensors={sensors}
			collisionDetection={collision}
			onDragStart={({ active }) => {
				if (typeof active.id === "string") {
					setActive(active.id);
				}
			}}
			onDragMove={move}
			onDragCancel={clear}
			onDragEnd={() => {
				if (drop) {
					onDrop(drop);
				}
				clear();
			}}
			accessibility={{
				screenReaderInstructions: {
					draggable:
						"Drag to reorder or nest. Use the layer actions menu to move with the keyboard.",
				},
			}}
		>
			<Context value={context}>{children}</Context>
			<DragOverlay dropAnimation={null}>
				{active && (
					<div className="max-w-64 rounded border border-neutral-500 bg-neutral-700 px-3 py-2 shadow-lg">
						{label(active)}
					</div>
				)}
			</DragOverlay>
		</DndContext>
	);
}

export function useTreeDragItem(
	id: string,
	{ disabled = false, expanded = false } = {},
) {
	const { active, drop } = useContext(Context);
	const draggable = useDraggable({ id, disabled });
	const droppable = useDroppable({ id, data: { expanded } });
	const { setNodeRef: setDraggable } = draggable;
	const { setNodeRef: setDroppable } = droppable;
	const ref = useCallback(
		(element: HTMLDivElement | null) => {
			setDraggable(element);
			setDroppable(element);
		},
		[setDraggable, setDroppable],
	);
	return {
		ref,
		handle: { ...draggable.attributes, ...draggable.listeners },
		dragging: active === id,
		drop: drop?.target === id ? drop.position : undefined,
	};
}
