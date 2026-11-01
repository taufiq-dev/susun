import {
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns2,
  Database,
  Eye,
  FileCode,
  Folder,
  FolderOpen,
  History,
  Link,
  Maximize2,
  Minimize2,
  PanelRight,
  Pencil,
  Plus,
  Power,
  RotateCw,
  Table2,
  Trash2,
  X,
  type LucideIcon
} from 'lucide-react'

// Trowel's icons, from Lucide (lucide-react, the icon set shadcn/ui uses). Each is named for what
// it means here, and its size is set here, so components don't pick glyphs or sizes themselves.
// They draw in the text colour (currentColor), so they follow the theme and the accent.

// Sizes in pixels. Lucide draws on a 24px grid with 2px lines, so at 16px a line is 1.33px.
const SMALL = 14
const NORMAL = 16
// The activity bar's.
const LARGE = 20

function sized(Glyph: LucideIcon, size: number): () => React.JSX.Element {
  return function Icon(): React.JSX.Element {
    return <Glyph size={size} aria-hidden className="shrink-0" />
  }
}

export const CloseIcon = sized(X, SMALL)
export const ChevronRightIcon = sized(ChevronRight, SMALL)
export const ChevronDownIcon = sized(ChevronDown, SMALL)
// The tables list's tree: a schema (closed or open), a table, a view.
export const SchemaIcon = sized(Folder, SMALL)
export const SchemaOpenIcon = sized(FolderOpen, SMALL)
export const TableIcon = sized(Table2, SMALL)
export const ViewIcon = sized(Eye, SMALL)

export const PlusIcon = sized(Plus, NORMAL)
export const RefreshIcon = sized(RotateCw, NORMAL)
export const PanelRightIcon = sized(PanelRight, NORMAL)
export const SplitRightIcon = sized(Columns2, NORMAL)
export const MaximizeIcon = sized(Maximize2, NORMAL)
export const RestoreIcon = sized(Minimize2, NORMAL)
export const LinkIcon = sized(Link, NORMAL)
export const PowerIcon = sized(Power, NORMAL)
export const PencilIcon = sized(Pencil, NORMAL)
export const SwitchIcon = sized(ArrowLeftRight, NORMAL)
export const FolderOpenIcon = sized(FolderOpen, NORMAL)
export const TrashIcon = sized(Trash2, NORMAL)
// A table's pages.
export const PreviousIcon = sized(ChevronLeft, NORMAL)
export const NextIcon = sized(ChevronRight, NORMAL)
export const CollapseAllIcon = sized(ChevronsDownUp, NORMAL)
export const ExpandAllIcon = sized(ChevronsUpDown, NORMAL)

export const TablesIcon = sized(Database, LARGE)
export const SavedQueriesIcon = sized(FileCode, LARGE)
export const HistoryIcon = sized(History, LARGE)
