import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import { routes } from '../../app/routing/routes';
import { useGlobalLoading } from '../../app/global-loading';
import { createAuthFormSchema, type AuthFormValues, type AuthMode } from '../../layouts/app-shell-auth.forms';
import { authCopy } from '../../layouts/auth-landing.content';
import { buildGoogleAuthStartUrl, login, signup } from '../../shared/api/client';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../shared/forms/errors';
import { FormField } from '../../shared/forms/fields';

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
    const returnTo = `${location.pathname}${location.search || ''}` || '/auth';
    window.location.assign(buildGoogleAuthStartUrl(returnTo));
  };

  return (
    <main className="auth-layout">
      <section className="auth-panel auth-panel-standalone" aria-label="Authentication">
        <div className="auth-panel-head">
          <Link className="brand auth-brand" to={routes.home} aria-label="Go to Home">
            <div className="brand-mark">KV</div>
            <div>
              <strong>Knowledge Vault</strong>
              <span>developer knowledge base</span>
            </div>
          </Link>
          <Link className="topbar-link landing-link" to={routes.home}>Overview</Link>
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
        <button className="icon-button auth-google-button" type="button" onClick={startGoogleAuth}>
          Continue with Google
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
