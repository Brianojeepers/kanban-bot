import { useState, type FormEvent } from "react";
import { Modal, modalError, modalInput as input, modalLabel as label } from "@/components/Modal";
import { changePassword, deleteAccount, failureMessage } from "@/lib/api";

type AccountDialogProps = {
  username: string;
  onClose: () => void;
  onDeleted: () => void;
};

export const AccountDialog = ({ username, onClose, onDeleted }: AccountDialogProps) => {
  const [passwordStatus, setPasswordStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (form.get("new_password") !== form.get("confirm_password")) {
      setPasswordStatus({ ok: false, text: "The new passwords do not match." });
      return;
    }
    try {
      await changePassword(String(form.get("current_password")), String(form.get("new_password")));
      formElement.reset();
      setPasswordStatus({ ok: true, text: "Password changed. Other devices have been signed out." });
    } catch (failure) {
      setPasswordStatus({ ok: false, text: failureMessage(failure, "Unable to change password.") });
    }
  };

  const submitDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await deleteAccount(String(new FormData(event.currentTarget).get("password")));
      onDeleted();
    } catch (failure) {
      setDeleteError(failureMessage(failure, "Unable to delete account."));
    }
  };

  return (
    <Modal title="Account" subtitle={`Signed in as ${username}`} closeLabel="Close account settings" onClose={onClose}>
      <form onSubmit={submitPassword} className="mt-6 space-y-3">
        <h3 className="font-display text-base font-semibold text-[var(--navy-dark)]">Change password</h3>
        <label className={label}>Current password<input name="current_password" type="password" required autoComplete="current-password" className={input} /></label>
        <label className={label}>New password<input name="new_password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className={input} /></label>
        <label className={label}>Confirm new password<input name="confirm_password" type="password" required autoComplete="new-password" className={input} /></label>
        {passwordStatus && (
          <p role={passwordStatus.ok ? "status" : "alert"} className={`rounded-xl px-3.5 py-2.5 text-sm ${passwordStatus.ok ? "bg-[var(--primary-blue)]/10 text-[var(--navy-dark)]" : "bg-[var(--danger)]/10 text-[var(--danger)]"}`}>
            {passwordStatus.text}
          </p>
        )}
        <button type="submit" className="rounded-xl bg-[var(--secondary-purple)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110">Change password</button>
      </form>

      <form onSubmit={submitDelete} className="mt-8 space-y-3 border-t border-[var(--stroke)] pt-6">
        <h3 className="font-display text-base font-semibold text-[var(--danger)]">Delete account</h3>
        <p className="text-sm text-[var(--gray-text)]">Permanently deletes your account, boards, cards and chat history.</p>
        <label className={label}>Password<input name="password" type="password" required autoComplete="current-password" className={input} /></label>
        {deleteError && <p role="alert" className={modalError}>{deleteError}</p>}
        <button type="submit" className="rounded-xl border border-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)] hover:text-white">Delete account</button>
      </form>
    </Modal>
  );
};
