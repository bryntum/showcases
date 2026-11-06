import {
    CellStyleModule, ClientSideRowModelApiModule, ClientSideRowModelModule, ColumnApiModule, ColumnAutoSizeModule,
    EventApiModule, HighlightChangesModule, ModuleRegistry, NumberFilterModule, QuickFilterModule, RenderApiModule,
    RowApiModule, RowDragModule, RowSelectionModule, RowStyleModule, ScrollApiModule, TextFilterModule,
    ValidationModule, themeQuartz
} from 'ag-grid-community';
import {
    ContextMenuModule, LicenseManager, RowGroupingModule, SetFilterModule, SparklinesModule,
    StatusBarModule
} from 'ag-grid-enterprise';
import { AgChartsCommunityModule } from 'ag-charts-community';

/**
 * AG Grid setup, once per page: the licence key, the modules the shipment grid uses and a theme on the Bryntum
 * theme's CSS variables.
 *
 * AG Grid Enterprise is a separately licensed third-party library, not part of Bryntum. The key is read at build time
 * from `VITE_AG_LICENSE_KEY` (a gitignored `.env.local` at the repository root). Without it AG Grid runs unlicensed:
 * it shows its watermark and logs a licence notice in the console.
 *
 * Learn more:
 * https://www.ag-grid.com/javascript-data-grid/modules/
 * https://www.ag-grid.com/javascript-data-grid/theming/
 * https://www.ag-grid.com/javascript-data-grid/license-install/
 */

const licenseKey = import.meta.env.VITE_AG_LICENSE_KEY;

if (licenseKey) {
    LicenseManager.setLicenseKey(licenseKey);
}

ModuleRegistry.registerModules([
    ClientSideRowModelModule,
    ClientSideRowModelApiModule,
    RowApiModule,
    ColumnApiModule,
    ColumnAutoSizeModule,
    RenderApiModule,
    ScrollApiModule,
    EventApiModule,
    RowSelectionModule,
    RowStyleModule,
    CellStyleModule,
    HighlightChangesModule,
    RowDragModule,
    QuickFilterModule,
    TextFilterModule,
    NumberFilterModule,
    SetFilterModule,
    RowGroupingModule,
    StatusBarModule,
    ContextMenuModule,
    // The ETA drift sparklines, drawn by AG Charts (Community)
    SparklinesModule.with(AgChartsCommunityModule),
    // Explains a misconfiguration in the console during development, left out of the build
    ...(import.meta.env.DEV ? [ValidationModule] : [])
]);

/**
 * The Quartz theme on the Bryntum theme's CSS variables. They follow light and dark mode (light-dark()), so the grid
 * follows the shell's light / dark switch with no code: one theme for both modes
 */
export const agTheme = themeQuartz.withParams({
    // The `color-scheme` of the page (scrollbars, inputs), not one of AG Grid's own
    browserColorScheme                       : 'inherit',
    fontFamily                               : 'inherit',
    fontSize                                 : 13,
    headerFontSize                           : 13,
    headerFontWeight                         : 600,
    backgroundColor                          : 'var(--b-neutral-100)',
    foregroundColor                          : 'var(--b-text-1)',
    textColor                                : 'var(--b-text-1)',
    subtleTextColor                          : 'var(--b-text-2)',
    accentColor                              : 'var(--b-primary)',
    borderColor                              : 'var(--b-border-6)',
    chromeBackgroundColor                    : 'var(--b-neutral-98)',
    headerBackgroundColor                    : 'var(--b-neutral-98)',
    headerTextColor                          : 'var(--b-text-2)',
    rowHoverColor                            : 'color-mix(in srgb, var(--b-primary) 6%, transparent)',
    selectedRowBackgroundColor               : 'color-mix(in srgb, var(--b-primary) 14%, transparent)',
    oddRowBackgroundColor                    : 'var(--b-neutral-100)',
    menuBackgroundColor                      : 'var(--b-neutral-100)',
    // Flashes of the cells that changed live
    valueChangeValueHighlightBackgroundColor : 'color-mix(in srgb, var(--b-color-amber) 35%, transparent)',
    rangeSelectionBorderColor                : 'var(--b-primary)',
    rowHeight                                : 44,
    // 43 plus its 1px border, the 44px of the schedule's time axis
    headerHeight                             : 43,
    spacing                                  : 6,
    wrapperBorder                            : false,
    wrapperBorderRadius                      : 0,
    borderRadius                             : 4
});
