import { Show, SignInButton, UserButton } from '@clerk/react'

/**
 * Login while signed out; the account menu once signed in. There is no
 * separate sign-up button: Clerk's login modal links to sign-up itself.
 */
export default function AuthControls() {
  return (
    <div className="auth-controls">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button type="button">Login</button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </div>
  )
}
