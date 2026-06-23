import React, { useEffect, useState } from 'react';
import { fetchAutoActionGlobal, setAutoActionGlobal } from '../../shared/api/client';
import { notifySuccess } from '../../shared/ui/notifications';
import { notifyGeneralFormError } from '../../shared/forms/errors';
import { PageHead, Panel } from '../../shared/ui/primitives';
import { InfoTooltip } from '../../shared/ui/info-tooltip';

type AutoActionGlobal = { enabled: boolean; action: 'none' | 'resolved' | 'archived'; afterHours: number | null };

export function AutomationsPage() {
    const [data, setData] = useState<AutoActionGlobal | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [enabled, setEnabled] = useState<boolean>(false);
    const [action, setAction] = useState<'none' | 'resolved' | 'archived'>('none');
    const [afterHours, setAfterHours] = useState<number | ''>('');
    const [afterHoursError, setAfterHoursError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let mounted = true;
        setIsLoading(true);
        fetchAutoActionGlobal()
            .then((res) => {
                if (!mounted) return;
                setData(res);
                setEnabled(res?.enabled ?? false);
                setAction(res?.action ?? 'none');
                setAfterHours(res?.afterHours ?? '');
            })
            .catch((err) => notifyGeneralFormError(err, 'Could not load settings'))
            .finally(() => { if (mounted) setIsLoading(false); });
        return () => { mounted = false; };
    }, []);

    async function onSave() {
        const payload = { enabled, action, afterHours: afterHours === '' ? null : Number(afterHours) };
        setIsSaving(true);
        try {
            await setAutoActionGlobal(payload);
            notifySuccess('Global auto-action saved');
            setData((prev) => ({ ...prev, ...payload } as AutoActionGlobal));
        } catch (err) {
            notifyGeneralFormError(err, 'Could not save settings');
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="w-full px-4 sm:px-6 lg:px-8 py-10">
            <PageHead title="Automations" subtitle="Application preferences and integrations" />

            <div className="mt-8">
                <Panel className="automation-panel p-6">
                    <div className="mb-8">
                        <h2 className="text-lg font-medium">Automation — Notes</h2>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Configure a global auto-action for notes that apply across projects.</p>
                    </div>

                    <div>
                        {isLoading ? (
                            <div className="animate-pulse space-y-6">
                                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
                                <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded" />
                                <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                            </div>
                        ) : (
                            <form className="space-y-10">
                                <div className="form-field">
                                    <div className="form-field-label-row">
                                        <span className="text-sm font-medium">Enable global auto-action</span>
                                        <InfoTooltip
                                            content={
                                                <span>
                                                    Enable to apply the chosen action (e.g., mark resolved or archive)
                                                    automatically after the configured time.
                                                </span>
                                            }
                                            iconClassName="w-4 h-4"
                                        />
                                    </div>
                                    <label className="kb-toggle mt-3">
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={enabled}
                                            onChange={(e) => setEnabled(e.target.checked)}
                                            aria-label="Enable global auto-action"
                                        />
                                        <span
                                            className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${enabled
                                                ? 'bg-slate-300 dark:bg-[var(--muted)]'
                                                : 'bg-slate-200 dark:bg-slate-700'
                                                }`}
                                        >
                                            <span
                                                className={`bg-white dark:bg-slate-800 w-4 h-4 rounded-full shadow transform transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'
                                                    }`}
                                            />
                                        </span>
                                    </label>
                                </div>

                                <div className="form-field">
                                    <label htmlFor="automation-action-select">Auto action</label>
                                    <select
                                        id="automation-action-select"
                                        value={action}
                                        onChange={(event) => setAction(event.target.value as 'none' | 'resolved' | 'archived')}
                                    >
                                        <option value="none">None</option>
                                        <option value="resolved">Mark as resolved</option>
                                        <option value="archived">Archive</option>
                                    </select>
                                    <p className="form-field-meta">Choose what happens to notes when the auto-action triggers.</p>
                                </div>

                                <div className="form-field">
                                    <label htmlFor="automation-after-hours">After (hours)</label>
                                    <div className="w-fit">
                                        <input
                                            id="automation-after-hours"
                                            type="number"
                                            min={1}
                                            max={999999}
                                            inputMode="numeric"
                                            value={afterHours as any}
                                            onChange={(e) => {
                                                const val = e.target.value === '' ? '' : Number(e.target.value);
                                                setAfterHours(val);
                                                if (val === '') {
                                                    setAfterHoursError(null);
                                                } else if (!Number.isFinite(val) || val < 1 || val > 999999) {
                                                    setAfterHoursError('Enter a number between 1 and 999999');
                                                } else {
                                                    setAfterHoursError(null);
                                                }
                                            }}
                                            onBlur={() => {
                                                if (afterHours === '') {
                                                    setAfterHoursError(null);
                                                } else if (!Number.isFinite(afterHours as number) || (afterHours as number) < 1 || (afterHours as number) > 999999) {
                                                    setAfterHoursError('Enter a number between 1 and 999999');
                                                } else {
                                                    setAfterHoursError(null);
                                                }
                                            }}
                                            className="w-32"
                                        />
                                    </div>
                                    <p className="form-field-meta">Number of hours after which the action should run. Leave empty to disable time window.</p>
                                    {afterHoursError ? <p className="form-error" role="alert">{afterHoursError}</p> : null}
                                </div>

                                <div className="form-actions">
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (afterHours !== '' && (!Number.isFinite(afterHours as number) || (afterHours as number) < 1 || (afterHours as number) > 999999)) {
                                                setAfterHoursError('Enter a number between 1 and 999999');
                                                return;
                                            }
                                            await onSave();
                                        }}
                                        disabled={isSaving}
                                        className="icon-button"
                                    >
                                        {isSaving ? 'Saving...' : 'Save changes'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </Panel>
            </div>
        </div>
    );
}

export default AutomationsPage;
