from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException

from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.task import Task
from app.schemas.task import TaskCreate
from app.core.database import Base
from app.core.database import engine

router = APIRouter()

Base.metadata.create_all(bind=engine)


@router.get("")
def get_tasks(db: Session = Depends(get_db)):
    tasks = db.query(Task).all()

    return tasks


@router.post("")
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db)
):
    task = Task(
        title=payload.title
    )

    db.add(task)

    db.commit()

    db.refresh(task)

    return task


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db)
):
    task = (
        db.query(Task)
        .filter(Task.id == task_id)
        .first()
    )

    if not task:
        raise HTTPException(
            status_code=404,
            detail="Task not found"
        )

    db.delete(task)

    db.commit()

    return {
        "message": "Task deleted"
    }