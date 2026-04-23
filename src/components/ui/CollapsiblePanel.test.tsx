import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CollapsiblePanel } from './CollapsiblePanel'

describe('CollapsiblePanel', () => {
  it('is closed by default', () => {
    render(
      <CollapsiblePanel title="Test panel">
        <div>Content</div>
      </CollapsiblePanel>
    )

    const body = screen.getByTestId('collapsible-body')
    expect(body).toHaveAttribute('hidden')
  })

  it('toggles open/closed on click', () => {
    render(
      <CollapsiblePanel title="Test panel">
        <div>Content</div>
      </CollapsiblePanel>
    )

    const header = screen.getByTestId('collapsible-header')
    const body = screen.getByTestId('collapsible-body')

    fireEvent.click(header)
    expect(body).not.toHaveAttribute('hidden')

    fireEvent.click(header)
    expect(body).toHaveAttribute('hidden')
  })

  it('updates aria-expanded correctly', () => {
    render(
      <CollapsiblePanel title="Test panel">
        <div>Content</div>
      </CollapsiblePanel>
    )

    const header = screen.getByTestId('collapsible-header')

    expect(header).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
  })

  it('toggles via keyboard (Enter)', async () => {
    const user = userEvent.setup()

    render(
      <CollapsiblePanel title="Test panel">
        <div>Content</div>
      </CollapsiblePanel>
    )

    const header = screen.getByTestId('collapsible-header')

    header.focus()
    await user.keyboard('{Enter}')

    expect(header).toHaveAttribute('aria-expanded', 'true')
  })
})
