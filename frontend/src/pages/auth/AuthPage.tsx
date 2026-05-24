import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import { withFrontendBasePath } from '../../app/base-path';
import { routes } from '../../app/routing/routes';
import { useGlobalLoading } from '../../app/global-loading';
import { createAuthFormSchema, type AuthFormValues, type AuthMode } from '../../layouts/app-shell-auth.forms';
import { authCopy } from '../../layouts/auth-landing.content';
import { buildGoogleAuthStartUrl, login, signup } from '../../shared/api/client';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../shared/forms/errors';
import { FormField } from '../../shared/forms/fields';
import { BrandMark } from '../../shared/ui/brand-mark';
import { ThemeToggle } from '../../shared/ui/theme-toggle';

function GoogleIcon() {
  return (
    <svg className="auth-google-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.72H.94v2.34A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.96 10.7A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.16.28-1.7V4.96H.94A9 9 0 0 0 0 9c0 1.45.34 2.82.94 4.04l3.02-2.34Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .94 4.96L3.96 7.3C4.67 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

export function AuthPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const globalLoading = useGlobalLoading();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const formRef = useRef<HTMLFormElement>(null);
  const schema = useMemo(() => createAuthFormSchema(mode), [mode]);
  const {
    clearErrors,
    formState: { errors },
    getValues,
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<AuthFormValues>({
    resolver: zodResolver(schema),
    shouldFocusError: false,
    defaultValues: { name: '', email: '', password: '' },
  });
  const mutation = useMutation({
    mutationFn: (values: AuthFormValues) => globalLoading.trackPromise(
      mode === 'login'
        ? login({ email: values.email, password: values.password })
        : signup({ name: values.name || '', email: values.email, password: values.password }),
    ),
    onSuccess: onAuthenticated,
    onError: (error) => {
      const fieldNames = applyBackendFieldErrors<AuthFormValues>(error, setError);
      if (fieldNames.length > 0) {
        window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNames));
        return;
      }
      notifyGeneralFormError(error, 'Could not authenticate with these details.');
    },
  });

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    mutation.reset();
    clearErrors();
    reset({ name: '', email: getValues('email'), password: getValues('password') });
  }, [clearErrors, getValues, mode, reset]);

  const onInvalid = (invalidErrors: typeof errors) => {
    window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors)));
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setSearchParams(nextMode === 'signup' ? { mode: 'signup' } : {});
  };

  const googleError = searchParams.get('error') || '';
  const googleErrorMessage = googleError === 'email_already_registered'
    ? 'This email already has a password account. Sign in with password first.'
    : googleError === 'google_auth_failed'
      ? 'Could not finish Google sign-in. Try again.'
      : '';
  const startGoogleAuth = () => {
    const returnToParams = new URLSearchParams(location.search);
    returnToParams.delete('error');
    const query = returnToParams.toString();
    const returnTo = withFrontendBasePath(`${location.pathname}${query ? `?${query}` : ''}` || routes.auth);
    window.location.assign(buildGoogleAuthStartUrl(returnTo));
  };

  return (
    <main className="auth-layout">
      <section className="auth-panel auth-panel-standalone" aria-label="Authentication">
        <div className="auth-panel-head">
          <Link className="brand auth-brand" to={routes.home} aria-label="Go to Home">
            <BrandMark />
            <div>
              <strong>Knowledge Vault</strong>
              <span>developer knowledge base</span>
            </div>
          </Link>
          <div className="auth-panel-head-actions">
            <ThemeToggle className="theme-toggle auth-theme-toggle" />
            <Link className="topbar-link landing-link" to={routes.home}>Overview</Link>
          </div>
        </div>
        <div className="segmented-control" role="tablist" aria-label="Access mode">
          <button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => switchMode('login')}>
            Sign in
          </button>
          <button className={mode === 'signup' ? 'active' : ''} type="button" onClick={() => switchMode('signup')}>
            Create account
          </button>
        </div>
        <div className="auth-panel-copy">
          <h1>{authCopy[mode].title}</h1>
          <p>{authCopy[mode].description}</p>
        </div>
        {googleErrorMessage ? <p className="form-error auth-provider-error" role="alert">{googleErrorMessage}</p> : null}
        <button className="auth-google-button" type="button" onClick={startGoogleAuth}>
          <GoogleIcon />
          <span>Continue with Google</span>
        </button>
        <div className="auth-divider" aria-hidden="true"><span /></div>
        <form className="auth-form" ref={formRef} noValidate onSubmit={handleSubmit((values) => mutation.mutate(values), onInvalid)}>
          {mode === 'signup' ? (
            <FormField name="name" label="Name" error={errors.name?.message} required>
              {(fieldProps) => <input autoComplete="name" {...fieldProps} {...register('name')} />}
            </FormField>
          ) : null}
          <FormField name="email" label="Email" error={errors.email?.message} required>
            {(fieldProps) => <input autoComplete="email" type="email" {...fieldProps} {...register('email')} />}
          </FormField>
          <FormField name="password" label="Password" error={errors.password?.message} required>
            {(fieldProps) => <input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type="password" {...fieldProps} {...register('password')} />}
          </FormField>
          <button className="icon-button auth-submit" type="submit" disabled={mutation.isPending}>
            {authCopy[mode].submit}
          </button>
        </form>
      </section>
    </main>
  );
}
