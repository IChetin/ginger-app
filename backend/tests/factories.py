import factory
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import User
from app.models.enums import UserRole


class ModelFactory(factory.Factory):
    class Meta:
        abstract = True


class UserFactory(ModelFactory):
    class Meta:
        model = User

    email = factory.Sequence(lambda number: f"user{number}@example.com")
    nickname = factory.Sequence(lambda number: f"user{number}")
    role = UserRole.USER


async def persist[T](session: AsyncSession, instance: T) -> T:
    session.add(instance)
    await session.flush()
    return instance
