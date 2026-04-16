import { describe, it, expect } from 'vitest'
import { makeActorContext } from './audit'

describe('makeActorContext', () => {
  it('returns via: membership with no platform_role for normal org members', () => {
    expect(makeActorContext({ via: 'membership' })).toEqual({ via: 'membership' })
  })

  it('ignores platform_role when via is membership', () => {
    // Defensive: even if a caller accidentally passes a platform_role with
    // membership, the resulting context must stay clean.
    expect(
      makeActorContext({ via: 'membership', platform_role: 'staff' }),
    ).toEqual({ via: 'membership' })
  })

  it('returns via: platform with platform_role when staff', () => {
    expect(
      makeActorContext({ via: 'platform', platform_role: 'staff' }),
    ).toEqual({ via: 'platform', platform_role: 'staff' })
  })

  it('returns via: platform with platform_role when support', () => {
    expect(
      makeActorContext({ via: 'platform', platform_role: 'support' }),
    ).toEqual({ via: 'platform', platform_role: 'support' })
  })

  it('normalises missing platform_role to null when via is platform', () => {
    // Phase A defensive default — via: 'platform' should never drop the
    // platform_role key, even if the caller did not provide one.
    expect(makeActorContext({ via: 'platform' })).toEqual({
      via: 'platform',
      platform_role: null,
    })
  })
})
