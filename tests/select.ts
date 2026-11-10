import { screen, within } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'

export async function openSelect(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  screen.getByRole('combobox', { name: label }).focus()
  await user.keyboard('{Enter}')
  return within(screen.getByRole('listbox'))
}

export async function chooseSelectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  name: string,
) {
  const options = await openSelect(user, label)
  options.getByRole('option', { name }).focus()
  await user.keyboard('{Enter}')
}
